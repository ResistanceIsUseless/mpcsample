import { useCallback, useEffect, useRef, useState } from "react";
import { SampleEngine } from "../audio/SampleEngine";
import { _cancelAllReleaseTimers, useMPCStore } from "../state/store";

/**
 * Audio engine lifecycle hook.
 *
 * Memory-safe contract:
 * - Engine is created lazily inside the mount effect (NOT in useState
 *   initializer). React 19 StrictMode runs effects mount→unmount→mount in dev;
 *   creating in useState would leave a disposed engine reused by the second
 *   mount. Creating per-effect lets us create fresh on each remount.
 * - Cleanup disposes the engine, clears the store ref, and cancels pending
 *   pad release timers so no stale closures fire after teardown.
 * - Vite HMR support: when this module hot-reloads, the previous instance is
 *   disposed via `import.meta.hot.dispose` so Tone nodes don't accumulate.
 */
export function useAudioEngine(): {
  engine: SampleEngine | null;
  isReady: boolean;
  start: () => Promise<void>;
  dispose: () => void;
} {
  const engineRef = useRef<SampleEngine | null>(null);
  const [engine, setEngine] = useState<SampleEngine | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Create engine on mount, dispose on unmount.
  // Effect creates a fresh engine each commit. The setState call below is
  // intentional: it publishes the engine for downstream consumers to read.
  // It runs once per mount (no cascade), so the lint rule's perf concern
  // doesn't apply here — disable for this specific call.
  useEffect(() => {
    const e = new SampleEngine();
    engineRef.current = e;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEngine(e);

    return () => {
      // Dispose synchronously, ignoring any errors (e.g., engine never started).
      try {
        e.dispose();
      } catch (err) {
        console.warn("SampleEngine dispose error", err);
      }
      useMPCStore.getState().setEngine(null);
      if (engineRef.current === e) {
        engineRef.current = null;
      }
      _cancelAllReleaseTimers();
    };
  }, []);

  // Forward store changes to the engine while it is ready.
  useEffect(() => {
    if (!isReady) return;
    let prevActiveKit = useMPCStore.getState().activeKit;
    const unsubscribe = useMPCStore.subscribe((state, prev) => {
      const e = engineRef.current;
      if (!e) return;
      if (state.bpm !== prev.bpm) e.setBpm(state.bpm);
      if (state.masterDb !== prev.masterDb) e.setMasterDb(state.masterDb);
      // Forward kit changes to the engine.
      if (state.activeKit !== prevActiveKit && state.activeKit) {
        prevActiveKit = state.activeKit;
        e.loadKit(state.activeKit).catch((err) => {
          console.warn("SampleEngine loadKit error", err);
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [isReady]);

  const start = useCallback(async () => {
    const e = engineRef.current;
    if (!e) return;
    if (e.isReady()) {
      // Already started by a previous start() (e.g., second-click on START).
      setIsReady(true);
      return;
    }
    await e.start();
    useMPCStore.getState().setEngine(e);
    useMPCStore.getState().setStarted(true);
    setIsReady(true);
  }, []);

  const dispose = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    try {
      e.dispose();
    } catch (err) {
      console.warn("SampleEngine dispose error", err);
    }
    // Explicit dispose always clears the store ref (caller intends teardown);
    // the conditional check in the unmount-cleanup effect protects against
    // StrictMode stomping a fresh engine.
    useMPCStore.getState().setEngine(null);
    setIsReady(false);
  }, []);

  return { engine, isReady, start, dispose };
}

// Vite HMR: dispose any engine attached to the store when this module is
// replaced, so the WebAudio graph doesn't accumulate orphaned nodes during dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      const e = useMPCStore.getState().engineRef;
      if (e && "dispose" in e && typeof e.dispose === "function") {
        e.dispose();
      }
      useMPCStore.getState().setEngine(null);
      _cancelAllReleaseTimers();
    } catch (err) {
      console.warn("HMR dispose error", err);
    }
  });
}
