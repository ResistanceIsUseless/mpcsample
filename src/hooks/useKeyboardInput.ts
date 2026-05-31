import { useEffect } from "react";
import { KEY_TO_IDX, localToGlobal } from "../data/padLayout";
import { useMPCStore } from "../state/store";

const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (FORM_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Listens to window keydown/keyup and maps QWERTY keys → GlobalPadIdx.
 *
 * KEY_TO_IDX gives a local pad index (0..15); the active bank is read from
 * the store at event time so switching banks in the UI is immediately
 * reflected for keyboard input.
 *
 * - Skips when `enabled` is false (no listeners attached at all)
 * - Skips when the target is a form field (INPUT / TEXTAREA / SELECT / contenteditable)
 * - Skips held keys (e.repeat === true)
 * - Uses velocity 0.9 for keyboard hits (same as prototype)
 */
export function useKeyboardInput(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isFormField(e.target)) return;
      const k = e.key.toLowerCase();
      const localIdx = KEY_TO_IDX[k];
      if (localIdx !== undefined) {
        e.preventDefault();
        const bankIdx = useMPCStore.getState().bankIdx;
        const globalIdx = localToGlobal(bankIdx, localIdx);
        useMPCStore.getState().triggerPad(globalIdx, 0.9);
      }
    };

    const onUp = (e: KeyboardEvent) => {
      if (isFormField(e.target)) return;
      const k = e.key.toLowerCase();
      const localIdx = KEY_TO_IDX[k];
      if (localIdx !== undefined) {
        const bankIdx = useMPCStore.getState().bankIdx;
        const globalIdx = localToGlobal(bankIdx, localIdx);
        useMPCStore.getState().releasePad(globalIdx);
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [enabled]);
}
