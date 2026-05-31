import * as Tone from "tone";
import { useMPCStore } from "../state/store";
import type {
  AudioEngineLike,
  KitName,
  KnobName,
  PadIndex,
  SampleId,
  SampleKit,
  SamplePad,
} from "../types/mpc.types";

/** Slim wrapper around a Tone.Player for one-shot drum hits. */
type PadPlayer = {
  player: Tone.Player;
  gainNode: Tone.Gain;
};

const PREFETCH_CONCURRENCY = 6;

/**
 * SampleEngine — sample-based playback engine implementing `AudioEngineLike`.
 *
 * Audio graph:
 *   per-pad Tone.Player → per-pad Tone.Gain (velocity + gainCoefficient)
 *     → master Tone.Gain → Tone.Waveform(1024) + Tone.FFT(1024) → destination
 *
 * Design principles:
 * - Lazy buffer load: buffers are only fetched on first `trigger` for that pad.
 * - Inflight deduplication: concurrent triggers on the same unloaded pad share
 *   a single fetch Promise; the buffer is stored once and used by all.
 * - StrictMode / HMR safety: `start()` is idempotent; `dispose()` is thorough.
 * - Per-pad Tone.Player: created on demand at first trigger, reused on retrigger.
 */
export class SampleEngine implements AudioEngineLike {
  private master: Tone.Gain | null = null;
  private waveform: Tone.Waveform | null = null;
  private fft: Tone.FFT | null = null;
  private ready = false;

  /** Decoded audio buffers keyed by SampleId. */
  private buffers = new Map<SampleId, Tone.ToneAudioBuffer>();

  /**
   * In-flight fetch promises keyed by SampleId.
   * Ensures concurrent triggers on the same unloaded pad share a single fetch.
   */
  private inflight = new Map<SampleId, Promise<Tone.ToneAudioBuffer>>();

  /** Current kit pad assignments (globalPadIdx → SamplePad). */
  private padMap = new Map<PadIndex, SamplePad>();

  /** Per-pad Tone.Player + gain nodes (created lazily on first trigger). */
  private padPlayers = new Map<PadIndex, PadPlayer>();

  /** Set of pad indices whose buffers are currently being fetched/decoded. */
  private loading = new Set<PadIndex>();

  async start(): Promise<void> {
    if (this.ready) return;
    await Tone.start();
    this.master = new Tone.Gain(Tone.dbToGain(-6)).toDestination();
    this.waveform = new Tone.Waveform(1024);
    this.master.connect(this.waveform);
    this.fft = new Tone.FFT(2048);
    this.master.connect(this.fft);
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Load a SampleKit: clear pad assignments and populate from kit.pads.
   * Lazy — no buffers are fetched here.
   */
  async loadKit(kit: SampleKit): Promise<void> {
    // Dispose per-pad players for slots that are changing, to avoid
    // stale player references after a kit switch.
    for (const [idx, pp] of this.padPlayers) {
      if (!kit.pads.some((p) => p.globalPadIdx === idx)) {
        pp.player.stop();
        pp.player.dispose();
        pp.gainNode.dispose();
      }
    }
    this.padMap.clear();
    this.padPlayers.clear();
    this.loading.clear();

    for (const pad of kit.pads) {
      this.padMap.set(pad.globalPadIdx, { ...pad });
    }
  }

  setPadSample(idx: PadIndex, pad: SamplePad | null): void {
    if (pad === null) {
      this.padMap.delete(idx);
      const pp = this.padPlayers.get(idx);
      if (pp) {
        try {
          pp.player.stop();
          pp.player.dispose();
          pp.gainNode.dispose();
        } catch {
          // ignore — may already be disposed
        }
        this.padPlayers.delete(idx);
      }
    } else {
      this.padMap.set(idx, { ...pad });
      const pp = this.padPlayers.get(idx);
      if (pp) {
        try {
          pp.player.stop();
          pp.player.dispose();
          pp.gainNode.dispose();
        } catch {
          // ignore
        }
        this.padPlayers.delete(idx);
      }
    }
  }

  setPadTune(idx: PadIndex, coarseTune: number, fineTune: number): void {
    const existing = this.padMap.get(idx);
    if (!existing) return;
    this.padMap.set(idx, { ...existing, coarseTune, fineTune });
    const pp = this.padPlayers.get(idx);
    if (pp) {
      pp.player.playbackRate = this.computePlaybackRate(coarseTune, fineTune);
    }
  }

  setPadGain(idx: PadIndex, gainCoefficient: number): void {
    const existing = this.padMap.get(idx);
    if (!existing) return;
    this.padMap.set(idx, { ...existing, gainCoefficient });
    const pp = this.padPlayers.get(idx);
    if (pp) {
      pp.gainNode.gain.value = gainCoefficient;
    }
  }

  isPadLoading(idx: PadIndex): boolean {
    return this.loading.has(idx);
  }

  /**
   * Trigger pad at `idx` (GlobalPadIdx, 0..127) with `velocity` in [0,1].
   *
   * - If the buffer is already loaded: play immediately.
   * - If not yet loaded: mark pad as loading, kick off the fetch, and
   *   play-on-resolve so the first tap still produces sound (with ~network delay).
   * - Concurrent triggers while loading share the same inflight promise (deduped).
   */
  trigger(idx: PadIndex, velocity: number, time?: number): void {
    if (!this.ready || !this.master) return;
    const pad = this.padMap.get(idx);
    if (!pad) return;

    const clampedVelocity = Math.max(0.01, Math.min(1, velocity));
    const buf = this.buffers.get(pad.sampleId);

    if (buf) {
      // Buffer ready — play synchronously.
      try {
        this.playBuffer(idx, pad, buf, clampedVelocity, time);
      } catch (e) {
        console.warn("SampleEngine trigger error", e);
      }
      return;
    }

    // Buffer not yet loaded.
    if (!this.loading.has(idx)) {
      this.loading.add(idx);
      useMPCStore.getState().setPadLoading(idx, true);
    }

    this.ensureBuffer(pad)
      .then((loadedBuf) => {
        this.loading.delete(idx);
        useMPCStore.getState().setPadLoading(idx, false);
        // Play-on-resolve: use Tone.now() since the scheduled time may be stale.
        try {
          this.playBuffer(idx, pad, loadedBuf, clampedVelocity, undefined);
        } catch (e) {
          console.warn("SampleEngine play-on-resolve error", e);
        }
      })
      .catch((err) => {
        this.loading.delete(idx);
        useMPCStore.getState().setPadLoading(idx, false);
        console.warn(`SampleEngine: failed to load sample "${pad.sampleId}"`, err);
      });
  }

  release(_idx: PadIndex): void {
    // One-shot samples — no sustained release needed. API completeness only.
  }

  stopAll(): void {
    for (const [, pp] of this.padPlayers) {
      try {
        pp.player.stop();
      } catch {
        // ignore — player may already be stopped or disposed
      }
    }
  }

  /**
   * Eagerly fetch and decode all sample URLs in the currently loaded kit.
   * Uses a sliding window of `PREFETCH_CONCURRENCY` concurrent fetches.
   * Imported samples (url === null) that are already buffered are skipped.
   */
  async prefetchAll(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const pads = [...this.padMap.values()];

    // Only pads that need network fetching.
    const toFetch = pads.filter((p) => !this.buffers.has(p.sampleId) && p.url !== null);

    const total = pads.length;
    let loaded = pads.length - toFetch.length; // already-buffered count

    if (toFetch.length === 0) {
      onProgress?.(total, total);
      return;
    }

    // Sliding-window concurrency.
    let queueIdx = 0;

    async function runOne(engine: SampleEngine, pad: SamplePad): Promise<void> {
      await engine.ensureBuffer(pad);
      loaded += 1;
      onProgress?.(loaded, total);
    }

    async function worker(engine: SampleEngine): Promise<void> {
      while (queueIdx < toFetch.length) {
        const pad = toFetch[queueIdx++];
        await runOne(engine, pad);
      }
    }

    const workers = Array.from({ length: Math.min(PREFETCH_CONCURRENCY, toFetch.length) }, () =>
      worker(this),
    );
    await Promise.all(workers);
  }

  /**
   * Decode raw WAV bytes and register them under `sampleId` for immediate
   * playback. Called after the user drag-drops a `.wav` file.
   */
  async registerImportedSample(sampleId: SampleId, bytes: Uint8Array): Promise<void> {
    // Copy the bytes into a fresh ArrayBuffer to avoid detached-buffer issues.
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const audioCtx = Tone.getContext().rawContext as AudioContext;
    const decoded = await audioCtx.decodeAudioData(copy as ArrayBuffer);
    const buf = new Tone.ToneAudioBuffer(decoded);
    this.buffers.set(sampleId, buf);
  }

  getWaveform(): Float32Array | null {
    if (!this.waveform) return null;
    return this.waveform.getValue() as Float32Array;
  }

  getSpectrum(): Float32Array | null {
    if (!this.fft) return null;
    return this.fft.getValue() as Float32Array;
  }

  getPadChannelData(idx: PadIndex): Float32Array | null {
    const pad = this.padMap.get(idx);
    if (!pad) return null;
    const buf = this.buffers.get(pad.sampleId);
    if (!buf) return null;
    try {
      const audioBuffer = buf.get();
      if (!audioBuffer) return null;
      return audioBuffer.getChannelData(0);
    } catch {
      return null;
    }
  }

  setMasterDb(db: number): void {
    if (this.master) this.master.gain.rampTo(Tone.dbToGain(db), 0.05);
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  setKnob(name: KnobName, v: number): void {
    // mainVol maps to master volume; k1/k2/k3 are reserved for future FX.
    if (name === "mainVol") this.setMasterDb(-40 + v * 46);
  }

  /** @deprecated Synth kits retired; this is a no-op on SampleEngine. */
  setKit(_kit: KitName): void {
    // no-op — kits are now sample-based, loaded via loadKit(SampleKit).
  }

  /**
   * Swap the sample assignments of two pads. Replicates the legacy
   * `swapPadVoice` behaviour but operates on the sample padMap.
   */
  swapPadVoice(idxA: PadIndex, idxB: PadIndex): void {
    const a = this.padMap.get(idxA);
    const b = this.padMap.get(idxB);
    if (a) {
      this.padMap.set(idxB, a);
    } else {
      this.padMap.delete(idxB);
    }
    if (b) {
      this.padMap.set(idxA, b);
    } else {
      this.padMap.delete(idxA);
    }
    const ppA = this.padPlayers.get(idxA);
    const ppB = this.padPlayers.get(idxB);
    if (ppA) {
      this.padPlayers.set(idxB, ppA);
    } else {
      this.padPlayers.delete(idxB);
    }
    if (ppB) {
      this.padPlayers.set(idxA, ppB);
    } else {
      this.padPlayers.delete(idxA);
    }
  }

  dispose(): void {
    for (const [, pp] of this.padPlayers) {
      try {
        pp.player.stop();
        pp.player.dispose();
        pp.gainNode.dispose();
      } catch {
        // ignore — already disposed
      }
    }
    this.padPlayers.clear();

    for (const [, buf] of this.buffers) {
      try {
        buf.dispose();
      } catch {
        // ignore
      }
    }
    this.buffers.clear();
    this.inflight.clear();
    this.padMap.clear();
    this.loading.clear();

    try {
      this.waveform?.dispose();
    } catch {
      // ignore
    }
    this.waveform = null;
    try {
      this.fft?.dispose();
    } catch {
      // ignore
    }
    this.fft = null;
    try {
      this.master?.dispose();
    } catch {
      // ignore
    }
    this.master = null;
    this.ready = false;
  }

  /**
   * Ensure a buffer is available for the given pad. Returns the buffer once
   * decoded. Uses the `inflight` map to deduplicate concurrent fetches for
   * the same `sampleId`.
   */
  private ensureBuffer(pad: SamplePad): Promise<Tone.ToneAudioBuffer> {
    const existing = this.buffers.get(pad.sampleId);
    if (existing) return Promise.resolve(existing);

    const inFlight = this.inflight.get(pad.sampleId);
    if (inFlight) return inFlight;

    if (pad.url === null) {
      // Imported sample — must have been registered via registerImportedSample.
      // If the buffer is missing, we cannot load it from a URL.
      console.warn(`SampleEngine: imported sample "${pad.sampleId}" not yet registered.`);
      return Promise.reject(new Error(`Missing imported sample buffer for "${pad.sampleId}"`));
    }

    const fetchPromise: Promise<Tone.ToneAudioBuffer> = fetch(pad.url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`SampleEngine: HTTP ${res.status} fetching "${pad.url}"`);
        }
        return res.arrayBuffer();
      })
      .then((arrayBuf) => {
        const audioCtx = Tone.getContext().rawContext as AudioContext;
        return audioCtx.decodeAudioData(arrayBuf);
      })
      .then((audioBuffer) => {
        const toneBuf = new Tone.ToneAudioBuffer(audioBuffer);
        this.buffers.set(pad.sampleId, toneBuf);
        this.inflight.delete(pad.sampleId);
        return toneBuf;
      })
      .catch((err) => {
        this.inflight.delete(pad.sampleId);
        throw err;
      });

    this.inflight.set(pad.sampleId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Compute `playbackRate = 2^((coarseTune + fineTune / 100) / 12)`.
   */
  private computePlaybackRate(coarseTune: number, fineTune: number): number {
    return 2 ** ((coarseTune + fineTune / 100) / 12);
  }

  /**
   * Play a decoded buffer on the given pad, applying per-pad tune and gain.
   * Creates or reuses a per-pad Tone.Player + Tone.Gain node pair.
   */
  private playBuffer(
    idx: PadIndex,
    pad: SamplePad,
    buf: Tone.ToneAudioBuffer,
    velocity: number,
    time: number | undefined,
  ): void {
    if (!this.master) return;

    let pp = this.padPlayers.get(idx);

    if (!pp) {
      const gainNode = new Tone.Gain(pad.gainCoefficient * velocity).connect(this.master);
      const player = new Tone.Player(buf).connect(gainNode);
      player.playbackRate = this.computePlaybackRate(pad.coarseTune, pad.fineTune);
      pp = { player, gainNode };
      this.padPlayers.set(idx, pp);
    } else {
      // Retrigger: update the buffer in case it changed (setPadSample),
      // and update playback parameters.
      pp.player.buffer = buf;
      pp.player.playbackRate = this.computePlaybackRate(pad.coarseTune, pad.fineTune);
      pp.gainNode.gain.value = pad.gainCoefficient * velocity;
    }

    const playTime = time ?? Tone.now();
    pp.player.start(playTime);
  }
}
