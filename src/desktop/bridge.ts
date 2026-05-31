/**
 * bridge.ts — Renderer-side access to the `window.mpcDesktop` IPC bridge.
 *
 * Use `isDesktop()` to branch behaviour between the Electron desktop build and
 * the browser build. Use `desktop()` to get the typed bridge (throws if called
 * outside Electron — always guard with `isDesktop()` first).
 */

import type { MpcDesktop } from "./bridge.types";

export type { MpcDesktop } from "./bridge.types";

/** True when running inside the Electron desktop app. */
export function isDesktop(): boolean {
  return Boolean(typeof window !== "undefined" && window.mpcDesktop?.isElectron);
}

/**
 * Return the desktop bridge. Throws if the bridge is unavailable (i.e. not
 * running under Electron) — callers must guard with {@link isDesktop} first.
 */
export function desktop(): MpcDesktop {
  if (typeof window === "undefined" || !window.mpcDesktop) {
    throw new Error("mpcDesktop bridge unavailable — desktop() called outside Electron.");
  }
  return window.mpcDesktop;
}
