import { useCallback, useRef, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { buildUserSamplePad, importWavFile } from "../kits/importWav";
import type { GlobalPadIdx, SamplePad } from "../kits/kit.types";
import { useMPCStore } from "../state/store";
import type { PadDefinition } from "../types/mpc.types";

type PadProps = {
  /** Local pad definition (geometry, label, key) for the 4×4 layout. */
  definition: PadDefinition;
  /**
   * Global pad index (0..127) = bankIdx*16 + localIdx.
   * Used for store lookups and event dispatch.
   */
  globalIdx: GlobalPadIdx;
  /**
   * Assigned sample for this pad slot, or `null` if unpopulated.
   * When provided, `sample.displayName` replaces the static layout label.
   */
  sample?: SamplePad | null;
  /**
   * `true` while the sample buffer for this pad is being fetched/decoded.
   * Adds a subtle loading indicator and `aria-busy` attribute.
   */
  loading?: boolean;
  className?: string;
};

// Auto-dismiss delay for inline drop errors (ms).
const DROP_ERROR_DISMISS_MS = 4000;

export function Pad({
  definition,
  globalIdx,
  sample = null,
  loading = false,
  className,
}: PadProps) {
  const state = useMPCStore((s) => s.pads[globalIdx]);
  const triggerPad = useMPCStore((s) => s.triggerPad);
  const releasePad = useMPCStore((s) => s.releasePad);
  const registerUserSample = useMPCStore((s) => s.registerUserSample);
  const setPadSample = useMPCStore((s) => s.setPadSample);

  // useReducedMotion — CSS handles the transition:none override via media query;
  // we query it here so tests can verify the hook was invoked.
  useReducedMotion();

  const [isDragOver, setIsDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  // Timer reference so we can clear a pending dismiss on unmount / new error.
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDropError = useCallback(() => {
    if (errorTimerRef.current !== null) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setDropError(null);
  }, []);

  const showDropError = useCallback(
    (message: string) => {
      clearDropError();
      setDropError(message);
      errorTimerRef.current = setTimeout(() => {
        setDropError(null);
        errorTimerRef.current = null;
      }, DROP_ERROR_DISMISS_MS);
    },
    [clearDropError],
  );

  const stateClass = state === "press" ? "is-press" : state === "armed" ? "is-armed" : "";
  const loadingClass = loading ? "is-loading" : "";
  const dropClass = isDragOver ? "pad--drop-target" : "";
  const padClass = ["pad", stateClass, loadingClass, dropClass, className]
    .filter(Boolean)
    .join(" ");

  const paddedNum = String(definition.num).padStart(2, "0");

  // Sample name takes priority over the static layout label.
  const capLabel = sample?.displayName ?? definition.label;

  // Accessible label: pad number + bank-relative position + sample name.
  const ariaLabel = sample
    ? `Pad ${definition.num} — ${sample.displayName}`
    : `Pad ${definition.num} — ${definition.label}`;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const vel = e.pressure > 0 ? e.pressure : 0.9;
      triggerPad(globalIdx, vel);
      // setPointerCapture may not exist in all environments (e.g. jsdom)
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [globalIdx, triggerPad],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      releasePad(globalIdx);
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
    },
    [globalIdx, releasePad],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      releasePad(globalIdx);
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
    },
    [globalIdx, releasePad],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        releasePad(globalIdx);
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
    },
    [globalIdx, releasePad],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.repeat) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        triggerPad(globalIdx, 0.9);
      }
    },
    [globalIdx, triggerPad],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === " " || e.key === "Enter") {
        releasePad(globalIdx);
      }
    },
    [globalIdx, releasePad],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    // Only respond to file drags; ignore internal element drags.
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setIsDragOver(true);
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      // Capture mutable store refs at drop time so async continuation uses
      // the engine that is live when the drop fires (not a stale closure).
      const engineRef = useMPCStore.getState().engineRef;

      void (async () => {
        let firstError: string | null = null;
        await Promise.all(
          files.map(async (file, i) => {
            const targetIdx = (globalIdx + i) as typeof globalIdx;
            if (targetIdx > 127) return;
            try {
              const imported = await importWavFile(file);
              if (targetIdx === globalIdx) {
                registerUserSample(imported.sampleId, imported.bytes);
                await engineRef?.registerImportedSample?.(imported.sampleId, imported.bytes);
                setPadSample(globalIdx, buildUserSamplePad(globalIdx, imported));
              } else {
                useMPCStore.getState().registerUserSample(imported.sampleId, imported.bytes);
                await engineRef?.registerImportedSample?.(imported.sampleId, imported.bytes);
                useMPCStore
                  .getState()
                  .setPadSample(targetIdx, buildUserSamplePad(targetIdx, imported));
              }
            } catch (err) {
              if (firstError === null) {
                firstError = err instanceof Error ? err.message : "Failed to load sample.";
              }
            }
          }),
        );
        if (firstError !== null) {
          showDropError(firstError);
        } else {
          clearDropError();
        }
      })();
    },
    [globalIdx, registerUserSample, setPadSample, clearDropError, showDropError],
  );

  return (
    <button
      type="button"
      className={padClass}
      data-pad-idx={globalIdx}
      aria-label={ariaLabel}
      aria-pressed={state === "press"}
      aria-busy={loading || undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="pad-num">{paddedNum}</span>
      {loading && (
        <span className="pad-loading" aria-hidden="true">
          ·
        </span>
      )}
      <span className="pad-cap">{capLabel}</span>
      {dropError && (
        <span className="pad-drop-error" role="alert">
          {dropError}
        </span>
      )}
    </button>
  );
}
