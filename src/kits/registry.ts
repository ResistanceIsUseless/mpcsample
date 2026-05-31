/**
 * registry.ts — Committed static registry of sample-based preset kits.
 *
 * These entries are hard-authored constants that match the kits produced by
 * `scripts/build-kits.mjs`. The app can render the kit picker even before
 * `public/kits/` is populated (graceful "assets missing" state in dev).
 *
 * Do not modify the `id` or `padCount` values here without re-running the
 * build-kits script to keep the registry in sync with the manifests.
 */

import type { KitRegistryEntry } from "./kit.types";

/**
 * Ordered list of preset kits. The first entry is the default.
 *
 * padCount mirrors the actual populated-pad count from each source .xpj:
 *   aaa-kit  → 51 pads  (london-full)
 *   t.-kit   → 40 pads  (london-deluxe)
 *   et.-kit  → 26 pads  (london-essentials)
 *   i2.-kit  → 20 pads  (london-core)
 *   project  → 54 pads  (london-studio)
 */
export const KIT_REGISTRY: ReadonlyArray<KitRegistryEntry> = [
  {
    id: "london-full",
    displayName: "London Full",
    padCount: 51,
  },
  {
    id: "london-deluxe",
    displayName: "London Deluxe",
    padCount: 40,
  },
  {
    id: "london-essentials",
    displayName: "London Essentials",
    padCount: 26,
  },
  {
    id: "london-core",
    displayName: "London Core",
    padCount: 20,
  },
  {
    id: "london-studio",
    displayName: "London Studio",
    padCount: 54,
  },
] as const;

/**
 * The kit loaded by default when the app first starts.
 * Must match a valid `id` in `KIT_REGISTRY`.
 */
export const DEFAULT_KIT_ID = "london-full";

/**
 * Look up a registry entry by kit id.
 *
 * @param id - Kit identifier (e.g. `"london-full"`)
 * @returns The matching `KitRegistryEntry`, or `undefined` if not found.
 */
export function getRegistryEntry(id: string): KitRegistryEntry | undefined {
  return KIT_REGISTRY.find((entry) => entry.id === id);
}
