import type { MidiEvent, MidiStatus, PadIndex } from "../types/mpc.types";

export type MidiHandlers = {
  onEvent?: (event: MidiEvent) => void;
  onStatusChange?: (status: MidiStatus, deviceName: string | null) => void;
  onInputsChange?: (inputs: { id: string; name: string }[]) => void;
};

/**
 * Wraps the Web MIDI API with defensive handling for:
 * - Missing API (Firefox / non-Chromium browsers) → 'unsupported'
 * - Permission denied → 'denied'
 * - No devices connected → 'no-devices'
 * - Hot-plug / hot-unplug via onstatechange
 *
 * MIDI note mapping (Akai MPC Sample convention):
 *   The device transmits: note = (36 + globalPadIdx) mod 128
 *   Banks G and H wrap below 36 due to the mod-128 rollover.
 *   Invert: globalPadIdx = (note - 36 + 128) & 0x7f
 *   This is bank-agnostic — no store read required for pad mapping.
 */
export class MidiInput {
  private access: MIDIAccess | null = null;
  private handlers: MidiHandlers = {};
  private boundOnMessage: (e: MIDIMessageEvent) => void;
  private status: MidiStatus = "idle";
  private preferredDeviceName: string | null = null;

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
    this.handlers.onInputsChange?.([]);
  }

  setPreferredDevice(name: string | null): void {
    this.preferredDeviceName = name;
    this.bindInputs();
  }

  private bindInputs(): void {
    if (!this.access) return;
    const inputs: MIDIInput[] = [];
    this.access.inputs.forEach((inp) => {
      inputs.push(inp);
    });

    this.handlers.onInputsChange?.(
      inputs.map((inp) => ({ id: inp.id, name: inp.name ?? "Unknown" })),
    );

    if (inputs.length === 0) {
      this.setStatus("no-devices", null);
      return;
    }

    // Priority: explicit user preference → "MPC Sample" → first device.
    const target =
      this.preferredDeviceName !== null
        ? (inputs.find((inp) => inp.name === this.preferredDeviceName) ?? inputs[0])
        : (inputs.find((inp) => inp.name?.toLowerCase() === "mpc sample") ?? inputs[0]);

    inputs.forEach((inp) => {
      inp.onmidimessage = inp === target ? this.boundOnMessage : null;
    });

    this.setStatus("connected", target.name ?? "Unknown");
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

    // MPC Sample transmits: note = (36 + globalPadIdx) mod 128
    // Invert to recover globalPadIdx for all 8 banks (including the
    // mod-128 wrap-around that occurs in banks F–H).
    const globalIdx = ((note - 36 + 128) & 0x7f) as PadIndex;

    if (cmd === 0x90 && vel > 0) {
      this.handlers.onEvent?.({
        type: "noteOn",
        padIdx: globalIdx,
        velocity: vel / 127,
      });
    } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
      // Note Off (0x80) or Note On with vel=0 (running status note-off).
      this.handlers.onEvent?.({
        type: "noteOff",
        padIdx: globalIdx,
      });
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
