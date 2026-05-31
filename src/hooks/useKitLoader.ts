/**
 * useKitLoader.ts — Kit manifest fetch + store integration.
 *
 * Responsibilities:
 * - Once the audio engine is ready (`isReady` becomes true) and no kit is
 *   loaded yet, automatically loads the default kit.
 * - Exposes `switchKit(id)` for the KitEditor (WP-E) to call on user selection.
 * - `loadKitById` is exported as a module-level helper so WP-E/WP-F can import
 *   it directly without going through the hook (e.g. inside an event handler).
 *
 * The actual engine.loadKit call is NOT made here — it is handled by the
 * `activeKit` subscription inside `useAudioEngine`, which fires whenever
 * `activeKit` reference changes in the store.  This hook's job is only to
 * fetch the manifest and call `store.loadKit(manifest)`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktop } from "../desktop/bridge";
import { loadKitManifest } from "../kits/loadManifest";
import type { SampleKit } from "../kits/kit.types";
import { useMPCStore } from "../state/store";

const BLANK_WEB_KIT: SampleKit = {
  id: "new-project",
  displayName: "New Project",
  exportName: "New Project",
  key: "",
  bpm: 120,
  pads: [],
};

/**
 * Fetch and parse the manifest for `id`, then call `store.loadKit()`.
 *
 * @param id - Kit identifier, e.g. `"london-full"`.
 * @param signal - Optional `AbortSignal` to cancel the in-flight fetch.
 * @throws If the fetch fails (including 404 — assets not built yet).
 *         The error message includes a "run build-kits.mjs" hint for 404s.
 */
export async function loadKitById(id: string, signal?: AbortSignal): Promise<void> {
  const manifest = await loadKitManifest(id, signal);
  useMPCStore.getState().loadKit(manifest);
}

type UseKitLoaderResult = {
  /** The kit id currently being loaded, or `null` if idle. */
  loadingKitId: string | null;
  /** Human-readable error from the last failed load, or `null`. */
  error: string | null;
  /**
   * Switch to the kit with the given id.
   * Cancels any in-flight switch, fetches the manifest, and calls `store.loadKit`.
   */
  switchKit: (id: string) => Promise<void>;
};

/**
 * Manages kit loading lifecycle.
 *
 * When `isReady` first becomes `true` and no kit has been loaded yet,
 * automatically loads `DEFAULT_KIT_ID`.  Exposes `switchKit` for
 * subsequent user-initiated switches.
 */
export function useKitLoader(isReady: boolean): UseKitLoaderResult {
  const [loadingKitId, setLoadingKitId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the AbortController for the in-flight request so we can cancel it
  // when a new switchKit call arrives or the component unmounts.
  const abortRef = useRef<AbortController | null>(null);

  const switchKit = useCallback(async (id: string): Promise<void> => {
    // Cancel any in-flight request.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingKitId(id);
    setError(null);

    try {
      await loadKitById(id, controller.signal);
    } catch (err) {
      // Ignore abort errors — they are intentional cancellations.
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to load kit.";
      setError(message);
    } finally {
      // Only clear the loading flag if this controller is still current
      // (i.e. a newer switchKit call hasn't already replaced it).
      if (abortRef.current === controller) {
        setLoadingKitId(null);
      }
    }
  }, []);

  // Auto-load once the engine is ready and no kit is loaded.
  // - Desktop: skip — the Launcher handles kit selection.
  // - Web: start with a blank project (no preset assets).
  useEffect(() => {
    if (!isReady) return;
    if (isDesktop()) return;
    const { activeKit } = useMPCStore.getState();
    if (activeKit !== null) return;
    useMPCStore.getState().loadKit(BLANK_WEB_KIT);
  }, [isReady]);

  // Cancel any in-flight request on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { loadingKitId, error, switchKit };
}
