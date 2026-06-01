import { useEffect, useRef } from "react";
import { MidiInput } from "../midi/MidiInput";
import { useMPCStore } from "../state/store";
import type { MidiStatus } from "../types/mpc.types";

/**
 * Auto-binds the Web MIDI API to the MPC store.
 * Call `start()` after an audio-context unlock gesture (e.g. StartOverlay click).
 * The hook tears down the MidiInput on unmount.
 */
export function useMidiInput(): {
  start: () => Promise<void>;
  stop: () => void;
  status: MidiStatus;
  deviceName: string | null;
} {
  const inputRef = useRef<MidiInput | null>(null);
  const status = useMPCStore((s) => s.midiStatus);
  const deviceName = useMPCStore((s) => s.midiDeviceName);
  const preferredMidiDeviceName = useMPCStore((s) => s.preferredMidiDeviceName);

  useEffect(() => {
    inputRef.current = new MidiInput({
      onEvent: (event) => {
        const store = useMPCStore.getState();
        if (event.type === "noteOn") {
          // Auto-switch to the bank containing this pad so the UI reflects
          // whichever bank the user is playing on the hardware.
          store.setBank(event.padIdx >> 4);
          store.triggerPad(event.padIdx, event.velocity);
        } else if (event.type === "noteOff") {
          store.releasePad(event.padIdx);
        } else if (event.type === "cc") {
          if (event.controller === 1) store.setKnob("k1", event.value);
          else if (event.controller === 2) store.setKnob("k2", event.value);
          else if (event.controller === 3) store.setKnob("k3", event.value);
        }
      },
      onStatusChange: (s, name) => useMPCStore.getState().setMidiStatus(s, name),
      onInputsChange: (inputs) => useMPCStore.getState().setMidiInputs(inputs),
    });

    // Apply any persisted preferred device before first start.
    const saved = useMPCStore.getState().preferredMidiDeviceName;
    if (saved !== null) {
      inputRef.current.setPreferredDevice(saved);
    }

    return () => {
      inputRef.current?.stop();
      inputRef.current = null;
    };
  }, []);

  // When the preferred device changes in the store, tell MidiInput to rebind.
  useEffect(() => {
    inputRef.current?.setPreferredDevice(preferredMidiDeviceName);
  }, [preferredMidiDeviceName]);

  const start = async () => {
    await inputRef.current?.start();
  };
  const stop = () => inputRef.current?.stop();

  return { start, stop, status, deviceName };
}
