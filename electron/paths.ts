/**
 * paths.ts — Default filesystem paths for the MPC Sample desktop app.
 * No Electron imports — importable from unit tests.
 */

import * as fs from "node:fs/promises";

import type { DefaultExportDir } from "../src/desktop/bridge.types";

export const VOLUME_ROOT = "/Volumes/MPC-SD" as const;

export const DEFAULT_EXPORT_DIR = "/Volumes/MPC-SD/MPC-Sample/Projects" as const;

/**
 * Resolve the default export directory and check whether it is currently
 * accessible (i.e. the SD card is mounted and the path exists).
 */
export async function getDefaultExportDir(): Promise<DefaultExportDir> {
  try {
    await fs.access(DEFAULT_EXPORT_DIR);
    return { path: DEFAULT_EXPORT_DIR, exists: true };
  } catch {
    return { path: DEFAULT_EXPORT_DIR, exists: false };
  }
}
