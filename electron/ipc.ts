/**
 * ipc.ts — IPC channel name constants and result type for the MPC Sample
 * Electron main ↔ renderer bridge.
 */

import type { DesktopError } from "../src/desktop/bridge.types";

export const CH = {
  getDefaultExportDir: "mpc:getDefaultExportDir",
  chooseExportDir: "mpc:chooseExportDir",
  chooseProjectDir: "mpc:chooseProjectDir",
  readProject: "mpc:readProject",
  writeProject: "mpc:writeProject",
  ejectVolume: "mpc:ejectVolume",
  openPath: "mpc:openPath",
} as const;

export type IpcResult<T> = { ok: true; result: T } | { ok: false; error: DesktopError };
