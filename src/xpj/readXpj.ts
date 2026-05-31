/**
 * readXpj.ts — Parse a gzipped Akai `.xpj` file back into a `SampleKit`.
 *
 * Reverses the `buildXpj` / `assignPad` transformation:
 *   1. `decodeXpj` decompresses and JSON-parses the bytes
 *   2. Navigate to `data.tracks[0].program.drum.instruments[]`
 *   3. Each slot with a non-empty `layersv[0].sampleFile` becomes a `SamplePad`
 *   4. Numeric fields may be plain numbers or `{__raw__: "<lexeme>"}` tags
 *      (from `jsonLossless`) — `toNum()` unwraps either form.
 *
 * Callers (loadProject.ts, tests):
 *   const kit = parseXpjToKit(xpjBytes, "My Kit");
 */

import type { SampleKit, SamplePad } from "../kits/kit.types";
import { decodeXpj } from "./codec";

/**
 * Extract a plain JavaScript number from either a raw number or a
 * `{__raw__: "<lexeme>"}` tag produced by `parseLossless`.
 *
 * `decodeXpj` uses plain `JSON.parse`, so the values will normally be
 * plain numbers. This helper is a belt-and-suspenders guard for contexts
 * where the bytes were re-parsed with `parseLossless`.
 */
function toNum(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (
    value !== null &&
    typeof value === "object" &&
    "__raw__" in (value as Record<string, unknown>)
  ) {
    const raw = (value as Record<string, unknown>).__raw__;
    const n = parseFloat(String(raw));
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

type LayerVolume = {
  gainCoefficient: unknown;
  [key: string]: unknown;
};

type Layer = {
  sampleName: string;
  sampleFile: string;
  volume: LayerVolume;
  pan: unknown;
  coarseTune: unknown;
  fineTune: unknown;
  [key: string]: unknown;
};

type Instrument = {
  coarseTune: unknown;
  fineTune: unknown;
  layersv: Layer[];
  [key: string]: unknown;
};

/**
 * Parse a gzipped Akai `.xpj` byte array into a `SampleKit`.
 *
 * Each populated instrument slot (non-empty `layersv[0].sampleFile`) is
 * converted to a `SamplePad` with:
 * - `url: null` — bytes live in `userSamples`, not fetched from a URL
 * - `sampleId: "loaded:" + fileName` — stable de-dup key for `userSamples`
 *   and `registerImportedSample`; two pads sharing the same file share the
 *   same `sampleId`, so the buffer is decoded once.
 *
 * @param xpjBytes - Raw `.xpj` bytes (gzip-compressed Akai project).
 * @param fallbackName - Used as `displayName`/`exportName` when the project
 *   contains no `track.name` (should never happen with real files).
 * @throws If the bytes are not a valid `.xpj` or the track structure is missing.
 */
export function parseXpjToKit(xpjBytes: Uint8Array, fallbackName: string): SampleKit {
  // Step 1: decompress + JSON-parse.
  const { data } = decodeXpj(xpjBytes);

  // Step 2: navigate to instruments[].
  const dataRoot = data.data as Record<string, unknown>;

  const tracks = dataRoot.tracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error("parseXpjToKit: missing data.tracks array in XPJ payload");
  }

  const track = tracks[0] as Record<string, unknown>;
  const program = track.program as Record<string, unknown> | undefined;
  if (!program) {
    throw new Error("parseXpjToKit: missing data.tracks[0].program");
  }

  const drum = program.drum as Record<string, unknown> | undefined;
  if (!drum) {
    throw new Error("parseXpjToKit: missing data.tracks[0].program.drum");
  }

  const instruments = drum.instruments;
  if (!Array.isArray(instruments)) {
    throw new Error("parseXpjToKit: data.tracks[0].program.drum.instruments is not an array");
  }

  // Step 3: extract metadata.
  const trackName =
    typeof track.name === "string" && track.name.trim() !== "" ? track.name : fallbackName;

  const rawKey = dataRoot.key;
  const key = typeof rawKey === "string" && rawKey.trim() !== "" ? rawKey : "C Minor";

  // BPM: try to read from data.samples[0].metadata.tempo; default to 120.
  const dataSamples = dataRoot.samples;
  let bpm = 120;
  if (Array.isArray(dataSamples) && dataSamples.length > 0) {
    const firstSample = dataSamples[0] as Record<string, unknown>;
    const meta = firstSample.metadata as Record<string, unknown> | undefined;
    if (meta) {
      const tempoNum = toNum(meta.tempo, 0);
      if (tempoNum > 0) bpm = Math.round(tempoNum);
    }
  }

  // Step 4: build pads from populated instrument slots.
  const pads: SamplePad[] = [];

  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i] as Instrument;

    if (!inst || !Array.isArray(inst.layersv) || inst.layersv.length === 0) {
      continue;
    }

    const layer = inst.layersv[0];
    if (!layer) continue;

    // A populated instrument has a non-empty sampleFile.
    const fileName = typeof layer.sampleFile === "string" ? layer.sampleFile.trim() : "";
    if (fileName === "") continue;

    const sampleName =
      typeof layer.sampleName === "string" && layer.sampleName.trim() !== ""
        ? layer.sampleName.trim()
        : fileName.replace(/\.wav$/i, "");

    // Prefer instrument-level tune; fall back to layer-level.
    const coarseTune = Math.round(toNum(inst.coarseTune, toNum(layer.coarseTune, 0)));
    const fineTune = Math.round(toNum(inst.fineTune, toNum(layer.fineTune, 0)));

    const gainCoefficient = toNum((layer.volume as LayerVolume | undefined)?.gainCoefficient, 1.0);
    const pan = toNum(layer.pan, 0.5);

    // sampleId: "loaded:<fileName>" — stable de-dup key.
    // Two pads that share the same WAV file share the same sampleId so the
    // audio buffer is decoded once. The export path looks up userSamples by
    // this sampleId (for url===null pads), so it MUST match what
    // loadProject.ts passes to registerUserSample / registerImportedSample.
    const sampleId = `loaded:${fileName}`;

    pads.push({
      globalPadIdx: i,
      sampleId,
      displayName: sampleName,
      sampleName,
      fileName,
      url: null,
      coarseTune,
      fineTune,
      gainCoefficient,
      pan,
    });
  }

  return {
    id: "loaded",
    displayName: trackName,
    exportName: trackName,
    key,
    bpm,
    pads,
  };
}
