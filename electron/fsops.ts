/**
 * fsops.ts — Pure Node fs operations for the MPC Sample desktop app.
 *
 * NO `electron` imports — this module is safe to load in unit tests (node env)
 * and during electron-vite preload bundling without issues.
 */

import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type {
  DesktopErrorCode,
  LoadedProject,
  WriteProjectArgs,
  WriteProjectResult,
} from "../src/desktop/bridge.types";

/** Map a Node.js errno code string to the typed DesktopErrorCode set. */
function mapErrno(code: string | undefined): DesktopErrorCode {
  switch (code) {
    case "ENOENT":
      return "ENOENT";
    case "EACCES":
      return "EACCES";
    case "EEXIST":
      return "EEXIST";
    default:
      return "EUNKNOWN";
  }
}

/** Create a typed desktop error from any caught value. */
function toDesktopError(
  err: unknown,
  fallbackCode: DesktopErrorCode = "EUNKNOWN",
): Error & { code: DesktopErrorCode } {
  if (err instanceof Error && "code" in err) {
    const nodeErr = err as NodeJS.ErrnoException;
    const code = mapErrno(nodeErr.code);
    return Object.assign(new Error(nodeErr.message), { code });
  }
  if (err instanceof Error && (err as Error & { code?: unknown }).code !== undefined) {
    const typed = err as Error & { code: DesktopErrorCode };
    return Object.assign(new Error(typed.message), { code: typed.code });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return Object.assign(new Error(msg), { code: fallbackCode });
}

/** Sanitize a project name — strip characters illegal on common filesystems. */
function sanitizeProjectName(name: string): string {
  // Strip \ / : * ? " < > |
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

/**
 * Write a full MPC project (`.xpj` + `_[ProjectData]/` WAVs) to `destDir`.
 *
 * Throws a typed `Error & { code: DesktopErrorCode }` on failure so that the
 * caller (main process) can wrap it into an `IpcResult`.
 */
export async function writeProjectToDisk(
  args: WriteProjectArgs,
  destDir: string,
): Promise<WriteProjectResult> {
  const name = sanitizeProjectName(args.projectName);
  if (!name) {
    throw Object.assign(new Error("Project name is empty after sanitization."), {
      code: "EUNKNOWN" as DesktopErrorCode,
    });
  }

  const dataDir = path.join(destDir, `${name}_[ProjectData]`);
  const xpjPath = path.join(destDir, `${name}.xpj`);

  // Verify destDir exists
  try {
    await fs.access(destDir);
  } catch {
    throw Object.assign(new Error(`Destination directory does not exist: ${destDir}`), {
      code: "ENOENT" as DesktopErrorCode,
    });
  }

  // Guard against overwrite when not permitted
  if (!args.overwrite) {
    try {
      await fs.access(xpjPath);
      // If we reach here, the file exists — reject
      throw Object.assign(
        new Error(`Project already exists at ${xpjPath}. Set overwrite to replace it.`),
        { code: "EEXIST" as DesktopErrorCode },
      );
    } catch (err) {
      const typedErr = err as Error & { code?: string };
      if (typedErr.code === "EEXIST") throw err;
      // ENOENT from fs.access means the file does not exist — that's fine
    }
  }

  // Create the _[ProjectData] directory
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (err) {
    throw toDesktopError(err);
  }

  // Write WAV files first — use only the basename to prevent path traversal
  let sampleCount = 0;
  for (const sampleFile of args.sampleFiles) {
    const safeName = path.basename(sampleFile.path);
    const outPath = path.join(dataDir, safeName);
    try {
      await fs.writeFile(outPath, sampleFile.bytes);
      sampleCount++;
    } catch (err) {
      throw toDesktopError(err);
    }
  }

  // Write the .xpj last (atomicity: if WAVs fail, no .xpj is created)
  try {
    await fs.writeFile(xpjPath, args.xpjBytes);
  } catch (err) {
    throw toDesktopError(err);
  }

  return { written: xpjPath, dataDir, sampleCount };
}

/**
 * Read an MPC project given the direct path to an `.xpj` file.
 *
 * Derives the project directory from the file path, reads the `.xpj` bytes,
 * then locates the sibling `<xpjBase>_[ProjectData]` folder and reads every
 * `*.wav` inside it.
 *
 * Throws a typed `Error & { code: DesktopErrorCode }` on failure.
 */
export async function readProjectFromFile(xpjFilePath: string): Promise<LoadedProject> {
  const dir = path.dirname(xpjFilePath);
  const xpjBase = path.basename(xpjFilePath).replace(/\.xpj$/i, "");

  let xpjBytes: Uint8Array;
  try {
    const buf = await fs.readFile(xpjFilePath);
    xpjBytes = new Uint8Array(buf);
  } catch (err) {
    throw toDesktopError(err);
  }

  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw toDesktopError(err);
  }

  const canonicalDataDirName = `${xpjBase}_[ProjectData]`;
  const dataDirEntries = entries.filter(
    (e) => e.isDirectory() && e.name.endsWith("_[ProjectData]"),
  );

  let dataDirPath: string | null = null;
  const canonical = dataDirEntries.find((e) => e.name === canonicalDataDirName);
  if (canonical) {
    dataDirPath = path.join(dir, canonical.name);
  } else if (dataDirEntries.length === 1) {
    dataDirPath = path.join(dir, dataDirEntries[0].name);
  }

  const samples: { fileName: string; bytes: Uint8Array }[] = [];

  if (dataDirPath !== null) {
    let wavEntries: Dirent<string>[];
    try {
      wavEntries = await fs.readdir(dataDirPath, { withFileTypes: true });
    } catch (err) {
      throw toDesktopError(err);
    }

    const wavFiles = wavEntries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".wav"))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const wavEntry of wavFiles) {
      const wavPath = path.join(dataDirPath, wavEntry.name);
      try {
        const buf = await fs.readFile(wavPath);
        samples.push({ fileName: wavEntry.name, bytes: new Uint8Array(buf) });
      } catch (err) {
        throw toDesktopError(err);
      }
    }
  }

  return { dir, xpjBytes, samples };
}

/**
 * Read an MPC project from `dir`.
 *
 * Locates the single `*.xpj` in the directory, reads its bytes, then locates
 * the sibling `<xpjBaseName>_[ProjectData]` folder and reads every `*.wav`
 * inside it.
 *
 * Throws a typed `Error & { code: DesktopErrorCode }` on failure.
 */
export async function readProjectFromDir(dir: string): Promise<LoadedProject> {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw toDesktopError(err);
  }

  // Find all .xpj files
  const xpjEntries = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".xpj"))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (xpjEntries.length === 0) {
    throw Object.assign(new Error(`No .xpj file found in directory: ${dir}`), {
      code: "ENOXPJ" as DesktopErrorCode,
    });
  }

  // Use the first .xpj deterministically (sorted alphabetically)
  const xpjEntry = xpjEntries[0];
  const xpjPath = path.join(dir, xpjEntry.name);
  const xpjBase = xpjEntry.name.replace(/\.xpj$/i, "");

  // Read .xpj bytes
  let xpjBytes: Uint8Array;
  try {
    const buf = await fs.readFile(xpjPath);
    xpjBytes = new Uint8Array(buf);
  } catch (err) {
    throw toDesktopError(err);
  }

  // Locate the _[ProjectData] directory — prefer the canonical sibling name;
  // fall back to any single *_[ProjectData] dir present.
  const canonicalDataDirName = `${xpjBase}_[ProjectData]`;
  const dataDirEntries = entries.filter(
    (e) => e.isDirectory() && e.name.endsWith("_[ProjectData]"),
  );

  let dataDirPath: string | null = null;

  const canonical = dataDirEntries.find((e) => e.name === canonicalDataDirName);
  if (canonical) {
    dataDirPath = path.join(dir, canonical.name);
  } else if (dataDirEntries.length === 1) {
    // Accept a single non-canonical _[ProjectData] dir
    dataDirPath = path.join(dir, dataDirEntries[0].name);
  }
  // If no data dir found, return empty samples array (some projects may have none)

  const samples: { fileName: string; bytes: Uint8Array }[] = [];

  if (dataDirPath !== null) {
    let wavEntries: Dirent<string>[];
    try {
      wavEntries = await fs.readdir(dataDirPath, { withFileTypes: true });
    } catch (err) {
      throw toDesktopError(err);
    }

    const wavFiles = wavEntries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".wav"))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const wavEntry of wavFiles) {
      const wavPath = path.join(dataDirPath, wavEntry.name);
      try {
        const buf = await fs.readFile(wavPath);
        samples.push({ fileName: wavEntry.name, bytes: new Uint8Array(buf) });
      } catch (err) {
        throw toDesktopError(err);
      }
    }
  }

  return { dir, xpjBytes, samples };
}
