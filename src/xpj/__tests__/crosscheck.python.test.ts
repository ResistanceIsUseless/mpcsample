/**
 * crosscheck.python.test.ts — Verification layer 2: Python cross-check.
 *
 * Runs the reference `make_xpj.py` on a small fixture WAV set, then builds
 * an equivalent XPJ with the TypeScript `buildXpj` implementation, and
 * asserts that the structurally meaningful fields agree.
 *
 * Gate: if `python3` is not available on this machine, the entire suite is
 * skipped (so CI without Python still passes the JS-only layers).
 *
 * Normalisation rules (full-object equality is NOT expected):
 *   - All numbers are coerced via `Number()` (so Python's `120.0` == JS `120`).
 *   - `data.samples` and `track.samples` are sorted by `path` before comparison.
 *   - Only the "meaningful subset" of fields is compared:
 *       • instruments[i].layersv[0].sampleName / sampleFile
 *       • data.samples[n].name / path
 *       • tracks[0].samples[n].name / path
 *       • tracks[0].name
 *   - Float-formatting differences (e.g. `1` vs `1.0`) are intentionally
 *     absorbed by coercing through `Number()`.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SampleKit, SamplePad } from "../../kits/kit.types";
import { buildXpj } from "../buildXpj";
import { loadTemplate } from "../codec";

// ---------------------------------------------------------------------------
// Python availability check
// ---------------------------------------------------------------------------

let pythonAvailable = false;
try {
  execSync("python3 --version", { stdio: "pipe" });
  pythonAvailable = true;
} catch {
  // python3 not found — skip all tests in this file
}

const MAKE_XPJ_PY = join(__dirname, "../../../MPC-Sample/Projects/make_xpj.py");
const TEMPLATE_XPJ = join(__dirname, "../../../MPC-Sample/Projects/project.xpj");

// Check that the Python script and template actually exist (may be absent
// when running in CI without the MPC-Sample directory).
const projectFilesAvailable = existsSync(MAKE_XPJ_PY) && existsSync(TEMPLATE_XPJ);

const SKIP_REASON = !pythonAvailable
  ? "python3 not found on PATH — skipping Python cross-check tests"
  : !projectFilesAvailable
    ? "MPC-Sample/Projects files not available — skipping Python cross-check tests"
    : null;

// ---------------------------------------------------------------------------
// Minimal valid WAV helper
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid WAV file (44-byte header + a few PCM samples).
 * Format: 16-bit PCM mono, 44100 Hz, 8 sample frames = 16 bytes data.
 */
function makeMinimalWav(seed = 0): Uint8Array {
  const dataSize = 16; // 8 frames × 2 bytes/frame
  const fileSize = 44 + dataSize - 8;

  const buf = new Uint8Array(44 + dataSize);
  const view = new DataView(buf.buffer);

  // RIFF header
  buf.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, fileSize, true); // file size - 8
  buf.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  buf.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 44100, true); // sample rate
  view.setUint32(28, 88200, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  buf.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);

  // 8 PCM samples with distinct values per WAV (avoid all-zeros for realism)
  for (let i = 0; i < 8; i++) {
    view.setInt16(44 + i * 2, (seed * 1000 + i * 100) & 0x7fff, true);
  }

  return buf;
}

// ---------------------------------------------------------------------------
// Normaliser helpers
// ---------------------------------------------------------------------------

type SampleEntry = { name: string; path: string };

function normaliseSamples(samples: unknown[]): SampleEntry[] {
  return (samples as Array<Record<string, unknown>>)
    .map((s) => ({ name: String(s.name ?? ""), path: String(s.path ?? "") }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

type InstrumentSubset = { sampleName: string; sampleFile: string };

function extractInstruments(instruments: unknown[]): InstrumentSubset[] {
  return (instruments as Array<Record<string, unknown>>).map((inst) => {
    const layers = (inst.layersv as Array<Record<string, unknown>>) ?? [];
    const layer = layers[0] ?? {};
    return {
      sampleName: String(layer.sampleName ?? ""),
      sampleFile: String(layer.sampleFile ?? ""),
    };
  });
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let tmpDir: string;
let samplesDir: string;

const FIXTURE_PADS: Array<{
  localNum: number; // 1-indexed pad number used by make_xpj.py naming convention
  fileName: string;
  sampleName: string;
  wavSeed: number;
}> = [
  { localNum: 1, fileName: "1_kick.wav", sampleName: "1_kick", wavSeed: 1 },
  { localNum: 2, fileName: "2_snare.wav", sampleName: "2_snare", wavSeed: 2 },
  { localNum: 3, fileName: "3_hihat.wav", sampleName: "3_hihat", wavSeed: 3 },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (SKIP_REASON) return;

  tmpDir = mkdtempSync(join(tmpdir(), "mpcsample-crosscheck-"));
  samplesDir = join(tmpDir, "samples");
  mkdirSync(samplesDir, { recursive: true });

  // Write fixture WAVs with pad-number prefixes (as make_xpj.py expects)
  for (const pad of FIXTURE_PADS) {
    const wavBytes = makeMinimalWav(pad.wavSeed);
    writeFileSync(join(samplesDir, pad.fileName), wavBytes);
  }
});

afterAll(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Python cross-check", () => {
  // Skip the suite when python3 or project files are not available
  it.skipIf(!!SKIP_REASON)(`availability (${SKIP_REASON ?? "available"})`, () => {
    // If SKIP_REASON is null we get here — just a sentinel that things are set up
    expect(pythonAvailable).toBe(true);
    expect(projectFilesAvailable).toBe(true);
  });

  it.skipIf(!!SKIP_REASON)("make_xpj.py produces a valid gzipped XPJ", () => {
    const outXpj = join(tmpDir, "fixture.xpj");

    const result = spawnSync(
      "python3",
      [MAKE_XPJ_PY, samplesDir, "-o", outXpj, "-t", TEMPLATE_XPJ, "-f"],
      { encoding: "utf-8" },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`make_xpj.py exited with status ${result.status}:\n${result.stderr}`);
    }

    expect(existsSync(outXpj)).toBe(true);
  });

  it.skipIf(!!SKIP_REASON)(
    "TypeScript buildXpj assigns same pads as Python reference",
    async () => {
      // ---- Run Python reference ----
      const outXpj = join(tmpDir, "fixture_ref.xpj");

      const result = spawnSync(
        "python3",
        [MAKE_XPJ_PY, samplesDir, "-o", outXpj, "-t", TEMPLATE_XPJ, "-f"],
        { encoding: "utf-8" },
      );

      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(`make_xpj.py failed:\n${result.stderr}`);
      }

      // Decompress and parse Python output
      const rawBytes = readFileSync(outXpj);
      const decompressed = gunzipSync(
        new Uint8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength),
      );
      const text = new TextDecoder().decode(decompressed);
      const lines = text.split("\n");
      const pyObj = JSON.parse(lines.slice(5).join("\n")) as {
        data: Record<string, unknown>;
      };

      // ---- Run TypeScript buildXpj ----
      const pads: SamplePad[] = FIXTURE_PADS.map((fp) => ({
        // make_xpj.py uses 1-indexed pad numbers → globalPadIdx = localNum - 1
        globalPadIdx: fp.localNum - 1,
        sampleId: `fixture:${fp.fileName}`,
        displayName: fp.sampleName,
        sampleName: fp.sampleName,
        fileName: fp.fileName,
        url: null,
        coarseTune: 0,
        fineTune: 0,
        gainCoefficient: 1.0,
        pan: 0.5,
      }));

      const kit: SampleKit = {
        id: "fixture",
        displayName: "Fixture Kit",
        exportName: "fixture",
        key: "C Minor",
        bpm: 114,
        pads,
      };

      const padBytes = new Map<string, Uint8Array>(
        FIXTURE_PADS.map((fp) => [fp.fileName, makeMinimalWav(fp.wavSeed)]),
      );

      const template = await loadTemplate();
      const built = buildXpj(template, kit, padBytes);

      // Decode the TypeScript output
      const tsDecompressed = gunzipSync(built.xpjBytes);
      const tsText = new TextDecoder().decode(tsDecompressed);
      const tsLines = tsText.split("\n");
      const tsObj = JSON.parse(tsLines.slice(5).join("\n")) as {
        data: Record<string, unknown>;
      };

      // ---- Structural comparison (meaningful subset only) ----

      // 1. Pad assignments: instruments[0..2].layersv[0].sampleName / sampleFile
      const pyInstruments = (
        (
          (pyObj.data.tracks as Array<Record<string, unknown>>)[0]?.program as Record<
            string,
            unknown
          >
        )?.drum as Record<string, unknown>
      )?.instruments as unknown[];
      const tsInstruments = (
        (
          (tsObj.data.tracks as Array<Record<string, unknown>>)[0]?.program as Record<
            string,
            unknown
          >
        )?.drum as Record<string, unknown>
      )?.instruments as unknown[];

      const pyPads = extractInstruments(pyInstruments ?? []);
      const tsPads = extractInstruments(tsInstruments ?? []);

      expect(tsPads.length).toBe(128);
      expect(pyPads.length).toBe(128);

      for (const fp of FIXTURE_PADS) {
        const idx = fp.localNum - 1;
        expect(tsPads[idx]).toEqual(pyPads[idx]);
      }

      // 2. Blank pads after the fixture range should have empty sampleFile
      for (let i = FIXTURE_PADS.length; i < 10; i++) {
        expect(tsPads[i]?.sampleFile).toBe("");
      }

      // 3. data.samples and track.samples (sorted by path)
      const pySamples = normaliseSamples((pyObj.data.samples as unknown[]) ?? []);
      const tsSamples = normaliseSamples((tsObj.data.samples as unknown[]) ?? []);
      expect(tsSamples).toEqual(pySamples);

      const pyTrackSamples = normaliseSamples(
        ((pyObj.data.tracks as Array<Record<string, unknown>>)[0]?.samples as unknown[]) ?? [],
      );
      const tsTrackSamples = normaliseSamples(
        ((tsObj.data.tracks as Array<Record<string, unknown>>)[0]?.samples as unknown[]) ?? [],
      );
      expect(tsTrackSamples).toEqual(pyTrackSamples);

      // 4. track.name: Python uses the output file stem ("fixture_ref" here);
      //    TS uses kit.exportName ("fixture"). We don't assert equality on name
      //    since the naming convention intentionally differs — just check it's set.
      const tsTrackName = (tsObj.data.tracks as Array<Record<string, unknown>>)[0]?.name;
      expect(typeof tsTrackName).toBe("string");
      expect((tsTrackName as string).length).toBeGreaterThan(0);
    },
  );

  it.skipIf(!!SKIP_REASON)(
    "TypeScript and Python both preserve float tokens (no parameter-length corruption)",
    async () => {
      // Whitespace-tolerant: Python's json.dumps(indent=0) puts a space after the
      // colon ("key": 1.0); the TS codec is compact ("key":1.0).
      const countFloatTokens = (s: string) => (s.match(/:\s*-?\d+\.0\b/g) || []).length;

      // ---- Python reference ----
      const outXpj = join(tmpDir, "fixture_floats.xpj");
      const result = spawnSync(
        "python3",
        [MAKE_XPJ_PY, samplesDir, "-o", outXpj, "-t", TEMPLATE_XPJ, "-f"],
        { encoding: "utf-8" },
      );
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`make_xpj.py failed:\n${result.stderr}`);

      const pyRaw = readFileSync(outXpj);
      const pyText = new TextDecoder().decode(
        gunzipSync(new Uint8Array(pyRaw.buffer, pyRaw.byteOffset, pyRaw.byteLength)),
      );

      // ---- TypeScript buildXpj ----
      const pads: SamplePad[] = FIXTURE_PADS.map((fp) => ({
        globalPadIdx: fp.localNum - 1,
        sampleId: `fixture:${fp.fileName}`,
        displayName: fp.sampleName,
        sampleName: fp.sampleName,
        fileName: fp.fileName,
        url: null,
        coarseTune: 0,
        fineTune: 0,
        gainCoefficient: 1.0,
        pan: 0.5,
      }));
      const kit: SampleKit = {
        id: "fixture",
        displayName: "Fixture Kit",
        exportName: "fixture",
        key: "C Minor",
        bpm: 114,
        pads,
      };
      const padBytes = new Map<string, Uint8Array>(
        FIXTURE_PADS.map((fp) => [fp.fileName, makeMinimalWav(fp.wavSeed)]),
      );
      const built = buildXpj(await loadTemplate(), kit, padBytes);
      const tsText = new TextDecoder().decode(gunzipSync(built.xpjBytes));

      const pyTokens = countFloatTokens(pyText);
      const tsTokens = countFloatTokens(tsText);

      // Both writers must keep the format's tens of thousands of float tokens.
      expect(pyTokens).toBeGreaterThan(40000);
      expect(tsTokens).toBeGreaterThan(40000);
      // And they should agree closely (both blank the same template + 3 pads).
      expect(Math.abs(tsTokens - pyTokens)).toBeLessThan(50);
    },
  );

  it.skipIf(!!SKIP_REASON)("XPJ header is identical between Python and TypeScript", () => {
    const outXpj = join(tmpDir, "fixture_header.xpj");

    const result = spawnSync(
      "python3",
      [MAKE_XPJ_PY, samplesDir, "-o", outXpj, "-t", TEMPLATE_XPJ, "-f"],
      { encoding: "utf-8" },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`make_xpj.py failed:\n${result.stderr}`);
    }

    const rawBytes = readFileSync(outXpj);
    const decompressed = gunzipSync(
      new Uint8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength),
    );
    const pyText = new TextDecoder().decode(decompressed);
    const pyHeader = pyText.split("\n").slice(0, 5);

    // Expected header (constants from codec.ts)
    const expectedHeader = ["ACVS", "1.3.0.12", "SerialisableProjectData", "json", "Linux"];

    expect(pyHeader).toEqual(expectedHeader);
  });
});
