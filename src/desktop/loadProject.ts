/**
 * loadProject.ts — Orchestrate loading an existing `.xpj` project from disk.
 *
 * Electron-only.  Always guard calls with `isDesktop()`.
 *
 * Flow:
 *  1. `desktop().readProject(dir)` → `{ xpjBytes, samples }` via IPC
 *  2. `parseXpjToKit(xpjBytes, basename)` → `SampleKit`
 *  3. For each pad, find its WAV bytes in `samples` by `fileName`
 *     and register them under the pad's `sampleId` ("loaded:<fileName>")
 *     in both the store and the audio engine (de-duped by sampleId)
 *  4. `store.loadKit(kit)` — triggers `useAudioEngine`'s activeKit
 *     subscription which calls `engine.loadKit(kit)` automatically
 *
 * sampleId invariant:
 *   `parseXpjToKit` assigns `sampleId = "loaded:" + fileName`.
 *   `registerUserSample` / `registerImportedSample` are called with EXACTLY
 *   that sampleId so `exportKitToZip` can look up `userSamples.get(pad.sampleId)`
 *   for `url === null` pads.  If the sampleId diverges between parseXpjToKit
 *   and registration, samples are silently missing from exports.
 */

import type { SampleKit } from "../kits/kit.types";
import { useMPCStore } from "../state/store";
import { parseXpjToKit } from "../xpj/readXpj";
import { desktop } from "./bridge";

/** Extract the last path segment (basename) from an absolute path. */
function basename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

/**
 * Load an existing Akai `.xpj` project from `dir` into the store.
 *
 * Reads the `.xpj` + sibling `_[ProjectData]` WAVs via the Electron IPC
 * bridge, decodes them into a `SampleKit`, registers each WAV buffer under
 * the pad's `sampleId`, and calls `store.loadKit`.
 *
 * @throws If the IPC call fails (e.g. `ENOXPJ`, `ENOENT`) or the `.xpj`
 *   cannot be parsed.  Callers (the Launcher) should catch and display the
 *   error message.
 */
export async function loadProjectFromDir(dir: string): Promise<void> {
  const lp = await desktop().readProject(dir);

  const name = basename(dir).replace(/\.xpj$/i, "");
  const kit = parseXpjToKit(lp.xpjBytes, name);

  const store = useMPCStore.getState();

  // Index sample bytes by fileName for O(1) lookup.
  const samplesByFileName = new Map<string, Uint8Array>(
    lp.samples.map((s) => [s.fileName, s.bytes]),
  );

  // Track sampleIds already registered (de-dup: two pads sharing a file share
  // a sampleId and thus a single decoded buffer).
  const registered = new Set<string>();

  for (const pad of kit.pads) {
    if (registered.has(pad.sampleId)) continue;

    const bytes = samplesByFileName.get(pad.fileName);
    if (!bytes) {
      // WAV missing from the project data folder — skip silently (pad won't
      // play, but other pads should still load). A warning is appropriate;
      // an error would block the entire project load.
      console.warn(
        `loadProjectFromDir: sample "${pad.fileName}" not found in project data; pad ${pad.globalPadIdx} will be silent.`,
      );
      continue;
    }

    // Register in the store so exportKitToZip can include it in the ZIP.
    store.registerUserSample(pad.sampleId, bytes);

    // Register in the engine so the pad is immediately playable.
    const engine = store.engineRef;
    if (engine) {
      await engine.registerImportedSample(pad.sampleId, bytes);
    }

    registered.add(pad.sampleId);
  }

  // Trigger the activeKit subscription in useAudioEngine, which calls
  // engine.loadKit(kit) automatically — no direct engine call needed here.
  store.loadKit(kit);
}

/**
 * Replace the current kit with an empty "New Kit" so the user can build
 * from scratch by drag-dropping WAV files onto pads.
 */
export function loadBlankKit(): void {
  const blankKit: SampleKit = {
    id: "new",
    displayName: "New Kit",
    exportName: "New Kit",
    key: "C Minor",
    bpm: 120,
    pads: [],
  };
  useMPCStore.getState().loadKit(blankKit);
}
