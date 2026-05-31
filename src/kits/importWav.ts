/**
 * importWav.ts — Drag-drop / file-input WAV importer.
 *
 * Validates, reads, and packages a user-selected .wav File for ingestion
 * into the store (registerUserSample + setPadSample).
 */

import type { GlobalPadIdx, SampleId, SamplePad } from "./kit.types";

export type ImportedWav = {
  /** Stable sample id — prefixed with "user:" for imported files. */
  sampleId: SampleId;
  /** Sanitized filename, always ending in `.wav`. */
  fileName: string;
  /** Display name (fileName without extension). */
  sampleName: string;
  /** Raw PCM bytes, ready for `registerUserSample` and ZIP export. */
  bytes: Uint8Array;
};

/** Monotonic counter appended to sampleIds to avoid collisions. */
let _importCounter = 0;

/** Reset the counter (used in tests). */
export function _resetImportCounter(): void {
  _importCounter = 0;
}

/**
 * Sanitize a raw file name so it is safe for ZIP entry names and MPC path
 * strings while remaining as close to the original as possible.
 *
 * Allowed characters: letters, digits, space, ( ) . _ -
 * Everything else (including path separators / and \) is stripped.
 * The result always ends with the `.wav` extension (case-normalised to lower).
 *
 * @param raw - The original File.name value.
 * @returns A sanitized filename that ends with `.wav`.
 */
export function sanitizeFileName(raw: string): string {
  // Extract the basename (strip any path component that a browser might pass).
  const base = raw.replace(/.*[/\\]/, "");

  // Strip the extension (may be .wav / .WAV / .Wav …).
  const withoutExt = base.replace(/\.wav$/i, "");

  // Allow only safe characters; strip everything else.
  const safe = withoutExt.replace(/[^A-Za-z0-9 ()._-]/g, "");

  // Trim trailing/leading spaces and dots.
  const trimmed = safe.trim().replace(/^\.+|\.+$/g, "") || "imported";

  return `${trimmed}.wav`;
}

/**
 * Validate that `file` is a WAV audio file.
 * Accepts by file extension (.wav, case-insensitive) or MIME type
 * (audio/wav, audio/x-wav, audio/wave).
 *
 * @throws {Error} with a human-readable message on rejection.
 */
function validateWavFile(file: File): void {
  const nameOk = /\.wav$/i.test(file.name);
  const typeOk =
    file.type === "" || // some browsers report no type for WAV
    /^audio\/(wav|x-wav|wave)$/i.test(file.type);

  if (!nameOk) {
    throw new Error(
      `Only .wav files are supported. "${file.name}" does not have a .wav extension.`,
    );
  }

  if (!typeOk) {
    throw new Error(
      `Only WAV audio files are supported. "${file.name}" appears to be "${file.type || "unknown type"}".`,
    );
  }
}

/**
 * Validate, read, and package a user-dropped/selected WAV File.
 *
 * Validates the file type, reads all bytes via `arrayBuffer()`, derives a
 * sanitized filename and a collision-safe sampleId, then returns the result.
 *
 * Callers are responsible for:
 *   1. `store.registerUserSample(result.sampleId, result.bytes)` — registers
 *      the bytes so the engine can decode them and the exporter can include them.
 *   2. `store.setPadSample(globalIdx, buildUserSamplePad(globalIdx, result))`
 *
 * @param file - The WAV File from a drop event or `<input type="file">`.
 * @returns Resolved `ImportedWav` struct.
 * @throws {Error} If the file is not a valid WAV.
 */
export async function importWavFile(file: File): Promise<ImportedWav> {
  validateWavFile(file);

  const fileName = sanitizeFileName(file.name);
  const sampleName = fileName.replace(/\.wav$/i, "");

  // Ensure stable, collision-safe id.
  const counter = ++_importCounter;
  const sampleId: SampleId = counter === 1 ? `user:${fileName}` : `user:${fileName}:${counter}`;

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  return { sampleId, fileName, sampleName, bytes };
}

/**
 * Build a `SamplePad` for a user-imported WAV at `globalPadIdx`.
 *
 * Sets all tune/gain/pan values to their defaults so the pad plays back at
 * unity gain and no transposition.  The `url` is `null` because imported
 * samples are resolved from `userSamples` bytes, not HTTP.
 *
 * @param globalPadIdx - Target pad address (0..127).
 * @param imported     - Result of `importWavFile`.
 * @returns A fully-typed `SamplePad` ready for `setPadSample`.
 */
export function buildUserSamplePad(globalPadIdx: GlobalPadIdx, imported: ImportedWav): SamplePad {
  return {
    globalPadIdx,
    sampleId: imported.sampleId,
    displayName: imported.sampleName,
    sampleName: imported.sampleName,
    fileName: imported.fileName,
    url: null,
    coarseTune: 0,
    fineTune: 0,
    gainCoefficient: 1,
    pan: 0.5,
  };
}
