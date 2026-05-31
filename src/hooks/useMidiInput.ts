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

  useEffect(() => {
    inputRef.current = new MidiInput({
      onEvent: (event) => {
        const store = useMPCStore.getState();
        if (event.type === "noteOn") {
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
    });

    return () => {
      inputRef.current?.stop();
      inputRef.current = null;
    };
  }, []);

  const start = async () => {
    await inputRef.current?.start();
  };
  const stop = () => inputRef.current?.stop();

  return { start, stop, status, deviceName };
}
