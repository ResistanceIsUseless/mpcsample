/**
 * fsops.test.ts — Integration tests for electron/fsops.ts using real temp dirs.
 *
 * Run: pnpm exec vitest run --config electron/vitest.config.ts
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WriteProjectArgs } from "../../src/desktop/bridge.types";
import { readProjectFromDir, writeProjectToDisk } from "../fsops";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh temp directory for each test and clean it up after. */
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mpcsample-fsops-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeArgs(overrides: Partial<WriteProjectArgs> = {}): WriteProjectArgs {
  const xpjBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // fake .xpj bytes
  const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF" WAV header

  return {
    projectName: "Test Project",
    xpjBytes,
    sampleFiles: [
      { path: "kick.wav", bytes: wavBytes },
      { path: "snare.wav", bytes: wavBytes },
    ],
    overwrite: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("writeProjectToDisk + readProjectFromDir — round-trip", () => {
  it("writes .xpj and _[ProjectData]/*.wav files then reads them back", async () => {
    const args = makeArgs();
    const result = await writeProjectToDisk(args, tmpDir);

    // Verify returned paths
    expect(result.written).toBe(path.join(tmpDir, "Test Project.xpj"));
    expect(result.dataDir).toBe(path.join(tmpDir, "Test Project_[ProjectData]"));
    expect(result.sampleCount).toBe(2);

    // Verify on-disk structure
    const xpjStat = await fs.stat(result.written);
    expect(xpjStat.isFile()).toBe(true);
    const wavFiles = await fs.readdir(result.dataDir);
    expect(wavFiles.sort()).toEqual(["kick.wav", "snare.wav"]);

    // Round-trip: read the project back
    const loaded = await readProjectFromDir(tmpDir);
    expect(loaded.dir).toBe(tmpDir);
    expect(loaded.xpjBytes).toBeInstanceOf(Uint8Array);
    expect(loaded.xpjBytes).toEqual(args.xpjBytes);
    expect(loaded.samples).toHaveLength(2);

    const sampleNames = loaded.samples.map((s) => s.fileName).sort();
    expect(sampleNames).toEqual(["kick.wav", "snare.wav"]);
    for (const sample of loaded.samples) {
      expect(sample.bytes).toBeInstanceOf(Uint8Array);
      expect(sample.bytes.length).toBeGreaterThan(0);
    }
  });
});

describe("writeProjectToDisk — EEXIST guard", () => {
  it("throws EEXIST when .xpj already exists and overwrite is false", async () => {
    const args = makeArgs({ overwrite: false });
    // Write once to create the file
    await writeProjectToDisk(args, tmpDir);

    // Second write should throw
    await expect(writeProjectToDisk(args, tmpDir)).rejects.toMatchObject({
      code: "EEXIST",
    });
  });

  it("succeeds when .xpj already exists and overwrite is true", async () => {
    const args = makeArgs({ overwrite: false });
    await writeProjectToDisk(args, tmpDir);

    // Should not throw
    const result = await writeProjectToDisk({ ...args, overwrite: true }, tmpDir);
    expect(result.written).toContain(".xpj");
    expect(result.sampleCount).toBe(2);
  });
});

describe("writeProjectToDisk — ENOENT for missing destDir", () => {
  it("throws ENOENT when the destination directory does not exist", async () => {
    const args = makeArgs();
    const missingDir = path.join(tmpDir, "does-not-exist");

    await expect(writeProjectToDisk(args, missingDir)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("readProjectFromDir — ENOXPJ", () => {
  it("throws ENOXPJ when no .xpj file is present", async () => {
    // tmpDir is empty
    await expect(readProjectFromDir(tmpDir)).rejects.toMatchObject({
      code: "ENOXPJ",
    });
  });
});

describe("writeProjectToDisk — path traversal safety", () => {
  it("writes a file with path '../evil.wav' as 'evil.wav' inside the data dir", async () => {
    const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const args = makeArgs({
      sampleFiles: [{ path: "../evil.wav", bytes: wavBytes }],
    });

    const result = await writeProjectToDisk(args, tmpDir);

    // The traversal path should resolve inside dataDir, not outside tmpDir
    const expectedPath = path.join(result.dataDir, "evil.wav");
    const stat = await fs.stat(expectedPath);
    expect(stat.isFile()).toBe(true);

    // Verify the file was NOT created outside the dataDir
    const outerPath = path.join(tmpDir, "evil.wav");
    await expect(fs.stat(outerPath)).rejects.toThrow();
  });
});
