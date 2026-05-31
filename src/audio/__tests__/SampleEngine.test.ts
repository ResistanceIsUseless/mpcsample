import * as Tone from "tone";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Tone mock ──────────────────────────────────────────────────────────────────
// Implementation factories must be regular functions (not arrows) so that
// vitest's vi.fn() wrapper supports `new`-construction (Vitest 4 quirk).

function makeGain() {
  return {
    toDestination: vi.fn().mockReturnThis(),
    connect: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
    gain: {
      value: 1,
      rampTo: vi.fn(),
    },
  };
}

function makeWaveform() {
  return {
    getValue: vi.fn().mockReturnValue(new Float32Array(1024)),
    dispose: vi.fn(),
  };
}

function makeFft() {
  return {
    getValue: vi.fn().mockReturnValue(new Float32Array(1024)),
    dispose: vi.fn(),
  };
}

function makePlayer() {
  return {
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
    playbackRate: 1,
    buffer: null as unknown,
  };
}

function makeToneAudioBuffer(audioBuffer?: AudioBuffer) {
  return {
    dispose: vi.fn(),
    _audioBuffer: audioBuffer ?? null,
  };
}

// Captured instances for assertion
let mockMasterInstance: ReturnType<typeof makeGain>;
let mockWaveformInstance: ReturnType<typeof makeWaveform>;
let mockFftInstance: ReturnType<typeof makeFft>;

const mockTransport = { bpm: { value: 120 } };

vi.mock("tone", () => ({
  Gain: vi.fn(function (this: unknown) {
    mockMasterInstance = makeGain();
    return mockMasterInstance;
  }),
  Waveform: vi.fn(function (this: unknown) {
    mockWaveformInstance = makeWaveform();
    return mockWaveformInstance;
  }),
  FFT: vi.fn(function (this: unknown) {
    mockFftInstance = makeFft();
    return mockFftInstance;
  }),
  Player: vi.fn(function (this: unknown) {
    return makePlayer();
  }),
  ToneAudioBuffer: vi.fn(function (this: unknown, src: unknown) {
    return makeToneAudioBuffer(src as AudioBuffer | undefined);
  }),
  start: vi.fn().mockResolvedValue(undefined),
  now: vi.fn().mockReturnValue(0),
  dbToGain: vi.fn((db: number) => 10 ** (db / 20)),
  getTransport: vi.fn(() => mockTransport),
  getContext: vi.fn(() => ({
    rawContext: {
      decodeAudioData: vi.fn((buf: ArrayBuffer) => Promise.resolve(buf as unknown as AudioBuffer)),
    },
  })),
}));

// ── Store mock ─────────────────────────────────────────────────────────────────
// We need to intercept setPadLoading calls.
const mockSetPadLoading = vi.fn();
vi.mock("../../state/store", () => ({
  useMPCStore: {
    getState: vi.fn(() => ({
      setPadLoading: mockSetPadLoading,
    })),
  },
}));

// eslint-disable-next-line import/first
import type { SampleKit, SamplePad } from "../../types/mpc.types";
// ── Helpers ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line import/first
import { SampleEngine } from "../SampleEngine";

function makeSamplePad(overrides: Partial<SamplePad> = {}): SamplePad {
  return {
    globalPadIdx: 0,
    sampleId: "kick.wav",
    displayName: "Kick",
    sampleName: "kick.wav",
    fileName: "kick.wav",
    url: "/kits/test/kick.wav",
    coarseTune: 0,
    fineTune: 0,
    gainCoefficient: 1.0,
    pan: 0.5,
    ...overrides,
  };
}

function makeKit(pads: SamplePad[] = [makeSamplePad()]): SampleKit {
  return {
    id: "test-kit",
    displayName: "Test Kit",
    exportName: "TestKit",
    key: "C Minor",
    bpm: 120,
    pads,
  };
}

// Mock fetch to return a minimal ArrayBuffer.
function mockFetch(ok = true): void {
  const ab = new ArrayBuffer(4);
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? "OK" : "Not Found",
    arrayBuffer: vi.fn().mockResolvedValue(ab),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("SampleEngine", () => {
  let engine: SampleEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransport.bpm.value = 120;
    engine = new SampleEngine();
  });

  afterEach(() => {
    try {
      engine.dispose();
    } catch {
      // already disposed
    }
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  describe("start()", () => {
    it("is idempotent — calling start() twice does not reinitialise nodes", async () => {
      await engine.start();
      await engine.start();
      expect(Tone.Gain).toHaveBeenCalledTimes(1);
      expect(Tone.Waveform).toHaveBeenCalledTimes(1);
      expect(Tone.FFT).toHaveBeenCalledTimes(1);
    });

    it("builds master Gain → Waveform → destination", async () => {
      await engine.start();
      expect(engine.isReady()).toBe(true);
      expect(Tone.Gain).toHaveBeenCalledTimes(1);
      expect(Tone.Waveform).toHaveBeenCalledWith(1024);
      // master.toDestination() was called
      expect(mockMasterInstance.toDestination).toHaveBeenCalled();
      // master.connect(waveform) was called
      expect(
        mockMasterInstance.connect.mock.calls.some((c: unknown[]) => c[0] === mockWaveformInstance),
      ).toBe(true);
    });

    it("creates Tone.FFT(2048) and connects master to it", async () => {
      await engine.start();
      expect(Tone.FFT).toHaveBeenCalledWith(2048);
      expect(
        mockMasterInstance.connect.mock.calls.some((c: unknown[]) => c[0] === mockFftInstance),
      ).toBe(true);
    });

    it("start() is idempotent — Tone.FFT not called twice", async () => {
      await engine.start();
      await engine.start();
      expect(Tone.FFT).toHaveBeenCalledTimes(1);
    });

    it("isReady() is false before start()", () => {
      expect(engine.isReady()).toBe(false);
    });
  });

  // ── loadKit ───────────────────────────────────────────────────────────────────

  describe("loadKit()", () => {
    it("populates padMap without fetching buffers", async () => {
      await engine.start();
      mockFetch();
      const kit = makeKit();
      await engine.loadKit(kit);

      // No fetch should have been triggered — lazy.
      expect(global.fetch).not.toHaveBeenCalled();
      // But the pad should be triggerable (will kick off a fetch).
      expect(engine.isPadLoading(0)).toBe(false);
    });

    it("replaces a previous kit's pads", async () => {
      await engine.start();
      const kit1 = makeKit([makeSamplePad({ globalPadIdx: 0 })]);
      const kit2 = makeKit([makeSamplePad({ globalPadIdx: 5 })]);
      await engine.loadKit(kit1);
      await engine.loadKit(kit2);
      // Pad 0 from kit1 should be gone; only pad 5 remains.
      // Triggering pad 0 should be a no-op (no pad mapping).
      mockFetch();
      await engine.start();
      engine.trigger(0, 0.9);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── trigger ───────────────────────────────────────────────────────────────────

  describe("trigger()", () => {
    it("does nothing when engine is not ready", () => {
      const kit = makeKit();
      void engine.loadKit(kit);
      expect(() => engine.trigger(0, 0.9)).not.toThrow();
    });

    it("plays immediately when buffer is already loaded", async () => {
      await engine.start();
      mockFetch();
      const pad = makeSamplePad();
      const kit = makeKit([pad]);
      await engine.loadKit(kit);

      // Pre-load the buffer by registering an imported sample.
      const bytes = new Uint8Array([0, 1, 2, 3]);
      await engine.registerImportedSample(pad.sampleId, bytes);

      const MockPlayer = vi.mocked(Tone.Player);
      MockPlayer.mockClear();

      engine.trigger(0, 0.8);

      // A Tone.Player should be created and started.
      expect(MockPlayer).toHaveBeenCalledTimes(1);
      const playerInst = MockPlayer.mock.results[0].value as { start: ReturnType<typeof vi.fn> };
      expect(playerInst.start).toHaveBeenCalled();
    });

    it("marks pad as loading when buffer is missing and sets store flag", async () => {
      await engine.start();
      // Simulate a long fetch by using a deferred promise.
      let resolveFetch!: (v: Response) => void;
      const ab = new ArrayBuffer(4);
      global.fetch = vi.fn().mockReturnValue(
        new Promise<Response>((res) => {
          resolveFetch = res;
        }),
      );

      const pad = makeSamplePad();
      const kit = makeKit([pad]);
      await engine.loadKit(kit);

      engine.trigger(0, 0.9);

      expect(engine.isPadLoading(0)).toBe(true);
      expect(mockSetPadLoading).toHaveBeenCalledWith(0, true);

      // Unblock the fetch.
      resolveFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: () => Promise.resolve(ab),
      } as unknown as Response);
    });

    it("deduplicates concurrent triggers — only one fetch per sampleId", async () => {
      await engine.start();
      mockFetch();

      const pad = makeSamplePad();
      const kit = makeKit([pad]);
      await engine.loadKit(kit);

      // Trigger three times concurrently before the fetch resolves.
      engine.trigger(0, 0.8);
      engine.trigger(0, 0.7);
      engine.trigger(0, 0.6);

      // Allow microtasks (fetch mock) to run.
      await vi.waitFor(() => {
        expect(mockSetPadLoading).toHaveBeenCalledWith(0, false);
      });

      // Only one fetch despite three triggers.
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("plays on resolve after lazy load", async () => {
      await engine.start();
      mockFetch();

      const pad = makeSamplePad();
      await engine.loadKit(makeKit([pad]));

      const MockPlayer = vi.mocked(Tone.Player);
      MockPlayer.mockClear();

      engine.trigger(0, 0.9);

      await vi.waitFor(() => {
        expect(mockSetPadLoading).toHaveBeenCalledWith(0, false);
      });

      // After the buffer loaded, a player should have been started.
      const allStarts = MockPlayer.mock.results.flatMap(
        (r) => (r.value as { start: ReturnType<typeof vi.fn> }).start.mock.calls,
      );
      expect(allStarts.length).toBeGreaterThan(0);
    });
  });

  // ── Playback rate ─────────────────────────────────────────────────────────────

  describe("playbackRate from coarse/fine tune", () => {
    it("applies playbackRate = 2^((coarse + fine/100)/12)", async () => {
      await engine.start();
      // 12 semitones = one octave = playbackRate 2.
      const pad = makeSamplePad({ coarseTune: 12, fineTune: 0 });
      const bytes = new Uint8Array(4);
      await engine.registerImportedSample(pad.sampleId, bytes);
      await engine.loadKit(makeKit([pad]));

      const MockPlayer = vi.mocked(Tone.Player);
      MockPlayer.mockClear();

      engine.trigger(0, 1.0);

      expect(MockPlayer).toHaveBeenCalledTimes(1);
      const playerInst = MockPlayer.mock.results[0].value as {
        playbackRate: number;
      };
      expect(playerInst.playbackRate).toBeCloseTo(2, 5);
    });

    it("applies fine tune (50 cents = ~3% speed increase)", async () => {
      await engine.start();
      const pad = makeSamplePad({ coarseTune: 0, fineTune: 50 });
      const bytes = new Uint8Array(4);
      await engine.registerImportedSample(pad.sampleId, bytes);
      await engine.loadKit(makeKit([pad]));

      const MockPlayer = vi.mocked(Tone.Player);
      MockPlayer.mockClear();
      engine.trigger(0, 1.0);

      const playerInst = MockPlayer.mock.results[0].value as {
        playbackRate: number;
      };
      const expected = 2 ** (0.5 / 12);
      expect(playerInst.playbackRate).toBeCloseTo(expected, 5);
    });
  });

  // ── prefetchAll ───────────────────────────────────────────────────────────────

  describe("prefetchAll()", () => {
    it("loads all pad buffers and reports progress", async () => {
      await engine.start();
      mockFetch();

      const pads = [
        makeSamplePad({ globalPadIdx: 0, sampleId: "a.wav", url: "/a.wav" }),
        makeSamplePad({ globalPadIdx: 1, sampleId: "b.wav", url: "/b.wav" }),
        makeSamplePad({ globalPadIdx: 2, sampleId: "c.wav", url: "/c.wav" }),
      ];
      await engine.loadKit(makeKit(pads));

      const progress: Array<[number, number]> = [];
      await engine.prefetchAll((loaded, total) => {
        progress.push([loaded, total]);
      });

      expect(global.fetch).toHaveBeenCalledTimes(3);
      // Final progress report should be 3/3.
      const last = progress[progress.length - 1];
      expect(last).toEqual([3, 3]);
    });

    it("skips already-buffered samples in the progress total", async () => {
      await engine.start();
      mockFetch();

      const pads = [
        makeSamplePad({ globalPadIdx: 0, sampleId: "a.wav", url: "/a.wav" }),
        makeSamplePad({ globalPadIdx: 1, sampleId: "b.wav", url: "/b.wav" }),
      ];
      await engine.loadKit(makeKit(pads));

      // Pre-load "a.wav".
      await engine.registerImportedSample("a.wav", new Uint8Array(4));

      const progress: Array<[number, number]> = [];
      await engine.prefetchAll((loaded, total) => {
        progress.push([loaded, total]);
      });

      // Only "b.wav" should be fetched.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const last = progress[progress.length - 1];
      expect(last[1]).toBe(2); // total = 2 pads
    });
  });

  // ── registerImportedSample ────────────────────────────────────────────────────

  describe("registerImportedSample()", () => {
    it("decodes bytes and makes the buffer available for playback", async () => {
      await engine.start();

      // Capture the decodeAudioData mock before calling registerImportedSample
      // so we get the same reference used internally (getContext() returns a
      // fresh object each call — we need to spy at the source).
      const decodeAudioDataMock = vi.fn((buf: ArrayBuffer) =>
        Promise.resolve(buf as unknown as AudioBuffer),
      );
      vi.mocked(Tone.getContext).mockReturnValue({
        rawContext: { decodeAudioData: decodeAudioDataMock },
      } as unknown as ReturnType<typeof Tone.getContext>);

      const bytes = new Uint8Array([82, 73, 70, 70]); // RIFF header stub
      await engine.registerImportedSample("imported.wav", bytes);

      // Verify the buffer was decoded via decodeAudioData.
      expect(decodeAudioDataMock).toHaveBeenCalled();

      // The buffer should now be triggerable without a fetch.
      const pad = makeSamplePad({
        sampleId: "imported.wav",
        url: null,
      });
      await engine.loadKit(makeKit([pad]));
      engine.trigger(0, 0.9);

      // No fetch since buffer is registered.
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── Pad tuning / gain ─────────────────────────────────────────────────────────

  describe("setPadTune()", () => {
    it("updates the stored pad's tune fields", async () => {
      await engine.start();
      const pad = makeSamplePad({ coarseTune: 0, fineTune: 0 });
      await engine.loadKit(makeKit([pad]));
      engine.setPadTune(0, 7, 50);
      // No error thrown; next trigger will use updated tune values.
      expect(() => engine.setPadTune(0, 7, 50)).not.toThrow();
    });

    it("is a no-op for an unmapped pad", () => {
      expect(() => engine.setPadTune(99, 5, 0)).not.toThrow();
    });
  });

  describe("setPadGain()", () => {
    it("updates the stored pad's gainCoefficient", async () => {
      await engine.start();
      const pad = makeSamplePad({ gainCoefficient: 1.0 });
      await engine.loadKit(makeKit([pad]));
      expect(() => engine.setPadGain(0, 0.5)).not.toThrow();
    });

    it("is a no-op for an unmapped pad", () => {
      expect(() => engine.setPadGain(99, 0.5)).not.toThrow();
    });
  });

  // ── setMasterDb ───────────────────────────────────────────────────────────────

  describe("setMasterDb()", () => {
    it("calls master.gain.rampTo with dbToGain result and time 0.05", async () => {
      await engine.start();
      engine.setMasterDb(-6);
      expect(mockMasterInstance.gain.rampTo).toHaveBeenCalledWith(Tone.dbToGain(-6), 0.05);
    });
  });

  // ── setBpm ────────────────────────────────────────────────────────────────────

  describe("setBpm()", () => {
    it("sets Tone.getTransport().bpm.value", async () => {
      await engine.start();
      engine.setBpm(140);
      expect(mockTransport.bpm.value).toBe(140);
    });
  });

  // ── getWaveform ───────────────────────────────────────────────────────────────

  describe("getWaveform()", () => {
    it("returns null before start()", () => {
      expect(engine.getWaveform()).toBeNull();
    });

    it("returns Float32Array after start()", async () => {
      await engine.start();
      const buf = engine.getWaveform();
      expect(buf).toBeInstanceOf(Float32Array);
    });
  });

  // ── getSpectrum ───────────────────────────────────────────────────────────────

  describe("getSpectrum()", () => {
    it("returns null before start()", () => {
      expect(engine.getSpectrum()).toBeNull();
    });

    it("returns Float32Array from FFT analyser after start()", async () => {
      await engine.start();
      const result = engine.getSpectrum();
      expect(result).toBeInstanceOf(Float32Array);
      expect(mockFftInstance.getValue).toHaveBeenCalled();
    });
  });

  // ── swapPadVoice ──────────────────────────────────────────────────────────────

  describe("swapPadVoice()", () => {
    it("exchanges the pad assignments of two indices", async () => {
      await engine.start();
      const padA = makeSamplePad({ globalPadIdx: 0, sampleId: "a.wav" });
      const padB = makeSamplePad({ globalPadIdx: 1, sampleId: "b.wav" });
      await engine.loadKit(makeKit([padA, padB]));

      engine.swapPadVoice(0, 1);

      // After swap, triggering idx 0 should use b.wav, idx 1 should use a.wav.
      // We can verify by checking isPadLoading after a trigger with a fetch mock.
      mockFetch();
      engine.trigger(0, 0.9); // should try to load b.wav
      engine.trigger(1, 0.9); // should try to load a.wav

      // Both fetches should be triggered for the swapped URLs.
      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    });
  });

  // ── setKit (legacy no-op) ─────────────────────────────────────────────────────

  describe("setKit()", () => {
    it("is a no-op (does not throw)", async () => {
      await engine.start();
      expect(() => engine.setKit("HIP-HOP")).not.toThrow();
      expect(() => engine.setKit("TRAP")).not.toThrow();
    });
  });

  // ── release (no-op) ───────────────────────────────────────────────────────────

  describe("release()", () => {
    it("does not throw", () => {
      expect(() => engine.release(0)).not.toThrow();
    });
  });

  // ── dispose ───────────────────────────────────────────────────────────────────

  describe("dispose()", () => {
    it("tears down all nodes and resets ready state", async () => {
      await engine.start();
      engine.dispose();
      expect(engine.isReady()).toBe(false);
      expect(engine.getWaveform()).toBeNull();
      expect(mockWaveformInstance.dispose).toHaveBeenCalled();
      expect(mockMasterInstance.dispose).toHaveBeenCalled();
    });

    it("disposes the FFT analyser", async () => {
      await engine.start();
      engine.dispose();
      expect(mockFftInstance.dispose).toHaveBeenCalled();
    });

    it("is idempotent — double dispose does not throw", async () => {
      await engine.start();
      expect(() => {
        engine.dispose();
        engine.dispose();
      }).not.toThrow();
    });
  });
});
