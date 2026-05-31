#!/usr/bin/env node
/**
 * build-kits.mjs — Dev-time script: parse real Akai MPC .xpj projects,
 * copy WAVs into public/kits/<id>/, write manifest.json + index.json,
 * and generate the authoritative src/xpj/template.skeleton.json.
 *
 * Usage (from package dir):
 *   node scripts/build-kits.mjs
 *
 * Idempotent: safe to re-run. Overwrites existing outputs.
 */

import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
// Lexeme-preserving JSON codec — keeps float tokens (1.0, 0.0, …) intact so the
// generated skeleton matches the Akai `.xpj` format. Run via `tsx` (see the
// `build-kits` package.json script) so this `.ts` import resolves.
import { parseLossless, stringifyLossless } from "../src/xpj/jsonLossless.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(__dirname, "..");
const PROJECTS_DIR = join(PKG_DIR, "MPC-Sample", "Projects");
const PUBLIC_KITS_DIR = join(PKG_DIR, "public", "kits");
const SKELETON_PATH = join(PKG_DIR, "src", "xpj", "template.skeleton.json");

// ---- Kit definitions (locked in the plan) --------------------------------

/** @type {Array<{sourceBase: string, id: string, displayName: string, exportName: string, key: string, bpm: number}>} */
const KIT_DEFS = [
  {
    sourceBase: "aaa-kit-SA London Cm 114",
    id: "london-full",
    displayName: "London Full",
    exportName: "London Full - SA London Cm 114",
    key: "C Minor",
    bpm: 114,
  },
  {
    // Note: leading space in directory/file name
    sourceBase: " t.-kit-SA London Cm 114",
    id: "london-deluxe",
    displayName: "London Deluxe",
    exportName: "London Deluxe - SA London Cm 114",
    key: "C Minor",
    bpm: 114,
  },
  {
    sourceBase: "et.-kit-SA London Cm 114",
    id: "london-essentials",
    displayName: "London Essentials",
    exportName: "London Essentials - SA London Cm 114",
    key: "C Minor",
    bpm: 114,
  },
  {
    sourceBase: "i2.-kit-SA London Cm 114",
    id: "london-core",
    displayName: "London Core",
    exportName: "London Core - SA London Cm 114",
    key: "C Minor",
    bpm: 114,
  },
  {
    sourceBase: "project",
    id: "london-studio",
    displayName: "London Studio",
    exportName: "London Studio - SA London Cm 114",
    key: "C Minor",
    bpm: 114,
  },
];

// ---- XPJ parsing ----------------------------------------------------------

/**
 * Read and decompress an .xpj file.
 * Returns the raw string (header + JSON).
 * Handles both gzipped (magic 0x1f8b) and plain text files.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function readXpjFile(filePath) {
  const bytes = readFileSync(filePath);
  const isGzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!isGzipped) {
    return bytes.toString("utf-8");
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const gunzip = createGunzip();

    gunzip.on("data", (chunk) => chunks.push(chunk));
    gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    gunzip.on("error", reject);

    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.pipe(gunzip);
  });
}

/**
 * Parse .xpj content into a JS object.
 * Format: 5 header lines + JSON payload.
 * @param {string} content
 * @returns {{ header: string[], obj: object }}
 */
function parseXpj(content) {
  const lines = content.split("\n");
  const header = lines.slice(0, 5);
  const jsonStr = lines.slice(5).join("\n");
  const obj = JSON.parse(jsonStr);
  return { header, obj };
}

// ---- Pad extraction -------------------------------------------------------

/**
 * Extract SamplePad entries from parsed .xpj object.
 * @param {string} kitId
 * @param {object} obj - parsed .xpj root object
 * @returns {Array<object>} SamplePad[]
 */
function extractPads(kitId, obj) {
  const instruments = obj.data.tracks[0].program.drum.instruments;
  const pads = [];

  for (let globalPadIdx = 0; globalPadIdx < instruments.length; globalPadIdx++) {
    const inst = instruments[globalPadIdx];
    const layers = inst.layersv;
    if (!layers || layers.length === 0) continue;

    const layer = layers[0];
    const sampleFile = layer.sampleFile;
    if (!sampleFile || sampleFile.trim() === "") continue;

    const sampleName = layer.sampleName || "";
    const fileName = sampleFile;
    const coarseTune = typeof inst.coarseTune === "number" ? inst.coarseTune : 0;
    const fineTune = typeof inst.fineTune === "number" ? inst.fineTune : 0;
    const gainCoefficient =
      layer.volume && typeof layer.volume.gainCoefficient === "number"
        ? layer.volume.gainCoefficient
        : 1.0;
    const pan = typeof layer.pan === "number" ? layer.pan : 0.5;

    /** @type {import('../src/kits/kit.types').SamplePad} */
    const pad = {
      globalPadIdx,
      sampleId: `${kitId}:${fileName}`,
      displayName: sampleName,
      sampleName,
      fileName,
      url: `/kits/${kitId}/${fileName}`,
      coarseTune,
      fineTune,
      gainCoefficient,
      pan,
    };

    pads.push(pad);
  }

  return pads;
}

// ---- Skeleton generation --------------------------------------------------

/**
 * Generate a stripped skeleton from a raw .xpj JSON payload string.
 * Blanks all pad instruments, empties samples arrays, clears sequence note
 * events, and keeps all other structural keys intact.
 *
 * The payload is parsed with `parseLossless` so every number is carried as a
 * `{__raw__: "<lexeme>"}` tag — this preserves the format's float tokens
 * (`1.0`, `0.0`, …) that a plain `JSON.parse`/`JSON.stringify` round-trip would
 * destroy. The caller serialises the result with `stringifyLossless`.
 *
 * @param {string} rawJsonStr - the raw JSON payload (after the 5 header lines)
 * @returns {object} skeleton tree (numbers are `{__raw__}` tags)
 */
function generateSkeleton(rawJsonStr) {
  const skeleton = parseLossless(rawJsonStr);

  const instruments = skeleton.data.tracks[0].program.drum.instruments;

  // Find a truly blank instrument to use as the blank template.
  // Clone with structuredClone (NOT JSON round-trip) so the `{__raw__}` number
  // tags — and therefore the float lexemes — are preserved.
  let blankInstrument = null;
  for (const inst of instruments) {
    const layers = inst.layersv;
    const isEmpty =
      !layers || layers.length === 0 || (!layers[0].sampleFile && !layers[0].sampleName);
    if (isEmpty) {
      blankInstrument = structuredClone(inst);
      break;
    }
  }

  if (!blankInstrument) {
    // Fallback: use the last instrument and blank it manually
    blankInstrument = structuredClone(instruments[instruments.length - 1]);
  }

  // Ensure blank instrument has empty sample fields
  if (blankInstrument.layersv?.[0]) {
    blankInstrument.layersv[0].sampleName = "";
    blankInstrument.layersv[0].sampleFile = "";
  }

  // Reset all 128 instruments to the blank template
  for (let i = 0; i < instruments.length; i++) {
    instruments[i] = structuredClone(blankInstrument);
  }

  // Clear samples arrays
  skeleton.data.samples = [];
  skeleton.data.tracks[0].samples = [];

  // Clear sequence note/midi events
  const sequences = skeleton.data.sequences;
  if (Array.isArray(sequences)) {
    for (const seq of sequences) {
      // Handle the { key, value } wrapper structure
      const seqData = seq.value || seq;
      if (seqData && Array.isArray(seqData.tracks)) {
        for (const track of seqData.tracks) {
          if ("events" in track) track.events = [];
          if ("noteEvents" in track) track.noteEvents = [];
          if ("midiEvents" in track) track.midiEvents = [];
        }
      }
    }
  }

  return skeleton;
}

// ---- File operations ------------------------------------------------------

/**
 * Copy WAV files for a kit, returning total bytes copied.
 * @param {object} kit - kit definition
 * @param {string[]} fileNames - list of unique WAV filenames to copy
 * @returns {{ copiedCount: number, totalBytes: number, missing: string[] }}
 */
function copyWavFiles(kit, fileNames) {
  const projectDataDir = join(PROJECTS_DIR, `${kit.sourceBase}_[ProjectData]`);
  const destDir = join(PUBLIC_KITS_DIR, kit.id);
  mkdirSync(destDir, { recursive: true });

  let copiedCount = 0;
  let totalBytes = 0;
  const missing = [];

  for (const fileName of fileNames) {
    const srcPath = join(projectDataDir, fileName);
    const destPath = join(destDir, fileName);

    if (!existsSync(srcPath)) {
      missing.push(fileName);
      console.warn(`  WARN: missing source WAV: ${srcPath}`);
      continue;
    }

    copyFileSync(srcPath, destPath);
    const size = statSync(destPath).size;
    totalBytes += size;
    copiedCount++;
  }

  return { copiedCount, totalBytes, missing };
}

// ---- Main -----------------------------------------------------------------

async function main() {
  console.log("build-kits: starting...\n");

  let grandTotalBytes = 0;
  /** @type {Array<{id: string, displayName: string, padCount: number}>} */
  const registryEntries = [];

  for (const kit of KIT_DEFS) {
    const xpjPath = join(PROJECTS_DIR, `${kit.sourceBase}.xpj`);

    if (!existsSync(xpjPath)) {
      console.error(`ERROR: .xpj not found: ${xpjPath}`);
      process.exit(1);
    }

    console.log(`Processing kit: ${kit.displayName} (${kit.id})`);
    console.log(`  source: ${xpjPath}`);

    // Parse .xpj
    let content;
    try {
      content = await readXpjFile(xpjPath);
    } catch (err) {
      console.error(`ERROR reading ${xpjPath}:`, err.message);
      process.exit(1);
    }

    let obj;
    try {
      ({ obj } = parseXpj(content));
    } catch (err) {
      console.error(`ERROR parsing JSON from ${xpjPath}:`, err.message);
      process.exit(1);
    }

    // Extract pads
    const pads = extractPads(kit.id, obj);
    console.log(`  pads found: ${pads.length}`);

    // Collect unique file names (a file can theoretically be referenced
    // by multiple pads, though uncommon)
    const uniqueFileNames = [...new Set(pads.map((p) => p.fileName))];

    // Copy WAV files
    const { copiedCount, totalBytes, missing } = copyWavFiles(kit, uniqueFileNames);
    grandTotalBytes += totalBytes;

    if (missing.length > 0) {
      console.warn(`  WARN: ${missing.length} referenced WAV(s) not found in ProjectData`);
    }

    console.log(`  copied: ${copiedCount} WAV(s), ${(totalBytes / 1024).toFixed(1)} KB`);

    // Build manifest (KitManifest = SampleKit)
    /** @type {import('../src/kits/kit.types').SampleKit} */
    const manifest = {
      id: kit.id,
      displayName: kit.displayName,
      exportName: kit.exportName,
      key: kit.key,
      bpm: kit.bpm,
      pads,
    };

    // Write manifest.json
    const manifestPath = join(PUBLIC_KITS_DIR, kit.id, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    console.log(`  wrote: ${manifestPath}`);

    // Build registry entry
    registryEntries.push({
      id: kit.id,
      displayName: kit.displayName,
      padCount: pads.length,
    });

    console.log();
  }

  // Write index.json
  const indexPath = join(PUBLIC_KITS_DIR, "index.json");
  writeFileSync(indexPath, JSON.stringify(registryEntries, null, 2), "utf-8");
  console.log(`Wrote kit registry: ${indexPath}`);
  console.log(`  entries: ${registryEntries.map((e) => `${e.id}(${e.padCount})`).join(", ")}`);
  console.log();

  // Generate template.skeleton.json from project.xpj
  const projectXpjPath = join(PROJECTS_DIR, "project.xpj");
  if (!existsSync(projectXpjPath)) {
    console.error(`ERROR: project.xpj not found: ${projectXpjPath}`);
    process.exit(1);
  }

  console.log("Generating template.skeleton.json from project.xpj...");
  let projectContent;
  try {
    projectContent = await readXpjFile(projectXpjPath);
  } catch (err) {
    console.error("ERROR reading project.xpj:", err.message);
    process.exit(1);
  }

  // Extract the raw JSON payload (everything after the 5 header lines) so it
  // can be parsed losslessly — preserving the float tokens that the firmware
  // requires.
  const projectJsonStr = projectContent.split("\n").slice(5).join("\n");

  const skeleton = generateSkeleton(projectJsonStr);
  const skeletonJson = stringifyLossless(skeleton);
  writeFileSync(SKELETON_PATH, skeletonJson, "utf-8");
  const skeletonSize = statSync(SKELETON_PATH).size;
  console.log(`Wrote skeleton: ${SKELETON_PATH} (${(skeletonSize / 1024).toFixed(1)} KB)`);

  // Verify skeleton blanking (plain JSON.parse is fine for these checks)
  const skelObj = JSON.parse(skeletonJson);
  const skelInstruments = skelObj.data.tracks[0].program.drum.instruments;
  const populatedAfterBlank = skelInstruments.filter(
    (inst) => inst.layersv?.[0]?.sampleFile,
  ).length;
  const skelSamplesLen = skelObj.data.samples.length;

  // Verify float tokens survived (regression guard for the "parameter length"
  // hardware load failure). A real project.xpj has tens of thousands of `N.0`
  // float tokens; a JSON round-trip strips them all to bare integers.
  const floatTokenCount = (skeletonJson.match(/:-?\d+\.0\b/g) || []).length;
  console.log(
    `  Verification: ${populatedAfterBlank} populated pads (expected 0), ${skelSamplesLen} samples (expected 0), ${floatTokenCount} integer-float tokens (expected > 10000)`,
  );

  if (populatedAfterBlank !== 0 || skelSamplesLen !== 0) {
    console.error("ERROR: skeleton blanking verification failed!");
    process.exit(1);
  }

  if (floatTokenCount < 10000) {
    console.error(
      `ERROR: skeleton float-token verification failed — only ${floatTokenCount} "N.0" tokens found. ` +
        `Float formatting was lost; the exported .xpj would be rejected by the MPC.`,
    );
    process.exit(1);
  }

  console.log();
  console.log("=".repeat(60));
  console.log("Summary:");
  for (const entry of registryEntries) {
    console.log(`  ${entry.displayName.padEnd(20)} (${entry.id}): ${entry.padCount} pads`);
  }
  console.log(`  Total WAV data copied: ${(grandTotalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  Skeleton size: ${(skeletonSize / 1024).toFixed(1)} KB`);
  console.log("build-kits: done.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
