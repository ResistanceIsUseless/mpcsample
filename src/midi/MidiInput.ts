import { useMPCStore } from "../state/store";
import type { MidiEvent, MidiStatus, PadIndex } from "../types/mpc.types";

export type MidiHandlers = {
  onEvent?: (event: MidiEvent) => void;
  onStatusChange?: (status: MidiStatus, deviceName: string | null) => void;
};

/**
 * Wraps the Web MIDI API with defensive handling for:
 * - Missing API (Firefox / non-Chromium browsers) → 'unsupported'
 * - Permission denied → 'denied'
 * - No devices connected → 'no-devices'
 * - Hot-plug / hot-unplug via onstatechange
 *
 * MIDI note mapping (standard Akai MPC convention):
 *   Notes 36–51 → local pad indices 0–15 within the ACTIVE bank.
 *   Global pad index = bankIdx * 16 + (note - 36).
 *   bankIdx is read from the store at event time so switching banks in the
 *   UI is immediately reflected for incoming MIDI.
 */
export class MidiInput {
  private access: MIDIAccess | null = null;
  private handlers: MidiHandlers = {};
  private boundOnMessage: (e: MIDIMessageEvent) => void;
  private status: MidiStatus = "idle";

  constructor(handlers?: MidiHandlers) {
    this.handlers = handlers ?? {};
    this.boundOnMessage = (e) => this.parseMessage(e);
  }

  setHandlers(handlers: MidiHandlers): void {
    this.handlers = handlers;
  }

  async start(): Promise<void> {
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
      this.setStatus("unsupported", null);
      return;
    }
    this.setStatus("searching", null);
    try {
      this.access = await (
        navigator as Navigator & {
          requestMIDIAccess(opts: { sysex: boolean }): Promise<MIDIAccess>;
        }
      ).requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.bindInputs();
      this.bindInputs();
    } catch {
      this.setStatus("denied", null);
    }
  }

  stop(): void {
    if (!this.access) return;
    this.access.inputs.forEach((inp) => {
      inp.onmidimessage = null;
    });
    this.access.onstatechange = null;
    this.access = null;
    this.setStatus("idle", null);
  }

  private bindInputs(): void {
    if (!this.access) return;
    const inputs: MIDIInput[] = [];
    this.access.inputs.forEach((inp) => {
      inputs.push(inp);
    });
    if (inputs.length === 0) {
      this.setStatus("no-devices", null);
      return;
    }
    inputs.forEach((inp) => {
      inp.onmidimessage = this.boundOnMessage;
    });
    this.setStatus("connected", inputs[0].name ?? "Unknown");
  }

  private setStatus(status: MidiStatus, deviceName: string | null): void {
    this.status = status;
    this.handlers.onStatusChange?.(status, deviceName);
  }

  getStatus(): MidiStatus {
    return this.status;
  }

  private parseMessage(e: MIDIMessageEvent): void {
    // Guard: malformed message
    if (!e.data || e.data.length < 2) return;

    const statusByte = e.data[0];
    const note = e.data[1];
    const vel = e.data.length >= 3 ? (e.data[2] ?? 0) : 0;
    const cmd = statusByte & 0xf0;

    if (cmd === 0x90 && vel > 0) {
      // Note On with velocity — map to global pad index using active bank.
      const localIdx = note - 36;
      if (localIdx >= 0 && localIdx < 16) {
        const bankIdx = useMPCStore.getState().bankIdx;
        const globalIdx = (bankIdx * 16 + localIdx) as PadIndex;
        this.handlers.onEvent?.({
          type: "noteOn",
          padIdx: globalIdx,
          velocity: vel / 127,
        });
      }
    } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
      // Note Off (0x80) or Note On with vel=0 (running status note-off).
      const localIdx = note - 36;
      if (localIdx >= 0 && localIdx < 16) {
        const bankIdx = useMPCStore.getState().bankIdx;
        const globalIdx = (bankIdx * 16 + localIdx) as PadIndex;
        this.handlers.onEvent?.({
          type: "noteOff",
          padIdx: globalIdx,
        });
      }
    } else if (cmd === 0xb0) {
      // Control Change
      this.handlers.onEvent?.({
        type: "cc",
        controller: note,
        value: vel / 127,
      });
    }
    // All other status bytes (aftertouch, pitch bend, SysEx remnants) are ignored
  }
}
