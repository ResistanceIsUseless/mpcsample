/**
 * buildXpj.test.ts — Unit tests for the XPJ project builder.
 *
 * Test coverage:
 *  - resetPads: all 128 slots replaced with blank prototypes
 *  - assignPad: sampleName/sampleFile/coarseTune/fineTune/volume/pan set correctly
 *  - makeSampleEntry: correct structure with floatTag values
 *  - buildXpj: pad assignments at correct globalPadIdx
 *  - buildXpj: data.samples length equals unique file count
 *  - buildXpj: de-dup when two pads share the same fileName
 *  - buildXpj: track.name === kit.exportName
 *  - buildXpj: sampleFiles bytes returned correctly
 *  - buildXpj: missing bytes throws descriptively
 *  - buildXpj: round-trip through decodeXpj without throwing
 */

import { gunzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { SampleKit, SamplePad } from "../../kits/kit.types";
import { assignPad, buildXpj, makeSampleEntry, resetPads, wavFrameCount } from "../buildXpj";
import { decodeXpj, loadTemplate, serializeJson } from "../codec";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePad(
  globalPadIdx: number,
  fileName: string,
  overrides: Partial<SamplePad> = {},
): SamplePad {
  return {
    globalPadIdx,
    sampleId: `sample-${globalPadIdx}`,
    displayName: `Pad ${globalPadIdx}`,
    sampleName: fileName.replace(/\.wav$/, ""),
    fileName,
    url: null,
    coarseTune: 0,
    fineTune: 0,
    gainCoefficient: 1.0,
    pan: 0.5,
    ...overrides,
  };
}

function makeKit(pads: SamplePad[], overrides: Partial<SampleKit> = {}): SampleKit {
  return {
    id: "test-kit",
    displayName: "Test Kit",
    exportName: "TestKit",
    key: "C Minor",
    bpm: 114,
    pads,
    ...overrides,
  };
}

function makeBytes(label: string): Uint8Array {
  return new TextEncoder().encode(`WAV:${label}`);
}

/**
 * Build a minimal valid 16-bit mono PCM WAV buffer with `frames` sample frames.
 * blockAlign = 2 (1 channel × 2 bytes), so dataSize = frames × 2.
 */
function makeWav(frames: number): Uint8Array {
  const blockAlign = 2;
  const dataSize = frames * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const writeAscii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, 44100, true); // sampleRate
  view.setUint32(28, 44100 * blockAlign, true); // byteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bitsPerSample
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  return bytes;
}

// ---------------------------------------------------------------------------
// Type helpers for navigating the XPJ JSON tree in tests
// ---------------------------------------------------------------------------

type LayerVolume = {
  gainCoefficient: unknown;
  controlValue: unknown;
  law: unknown;
};

type Layer = {
  sampleName: string;
  sampleFile: string;
  volume: LayerVolume;
  pan: unknown;
  coarseTune: unknown;
  fineTune: unknown;
  sampleStart?: number;
  sampleEnd?: number;
  sliceInfo?: { Start: number; End: number };
};

type Instrument = {
  coarseTune: unknown;
  fineTune: unknown;
  layersv: Layer[];
  [key: string]: unknown;
};

type SampleEntry = {
  version: number;
  name: string;
  path: string;
  loadImpl: number;
  metadata: { tempo: unknown; rootNote: number; tune: unknown; key: string };
};

function getInstruments(data: Record<string, unknown>): Instrument[] {
  const tracks = data.tracks as Array<Record<string, unknown>>;
  const program = tracks[0].program as Record<string, unknown>;
  const drum = program.drum as Record<string, unknown>;
  return drum.instruments as Instrument[];
}

function getSamples(data: Record<string, unknown>): SampleEntry[] {
  return data.samples as SampleEntry[];
}

function getTrackSamples(data: Record<string, unknown>): SampleEntry[] {
  const tracks = data.tracks as Array<Record<string, unknown>>;
  return tracks[0].samples as SampleEntry[];
}

// ---------------------------------------------------------------------------
// wavFrameCount tests
// ---------------------------------------------------------------------------

describe("wavFrameCount", () => {
  it("returns the frame count for a valid 16-bit mono WAV", () => {
    expect(wavFrameCount(makeWav(1000))).toBe(1000);
    expect(wavFrameCount(makeWav(1))).toBe(1);
  });

  it("returns 0 for non-WAV bytes (e.g. test fixtures)", () => {
    expect(wavFrameCount(makeBytes("kick"))).toBe(0);
    expect(wavFrameCount(new Uint8Array(0))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resetPads tests
// ---------------------------------------------------------------------------

describe("resetPads", () => {
  it("fills all slots with blank instruments (empty sampleName/sampleFile)", () => {
    const instruments: Instrument[] = Array.from({ length: 128 }, (_, i) => ({
      coarseTune: i,
      fineTune: i,
      layersv: [
        {
          sampleName: `kick_${i}`,
          sampleFile: `kick_${i}.wav`,
          volume: { gainCoefficient: 1.0, controlValue: 1.0, law: 0 },
          pan: 0.5,
          coarseTune: 0,
          fineTune: 0,
        },
      ],
    }));

    resetPads(instruments);

    expect(instruments).toHaveLength(128);
    for (const inst of instruments) {
      expect(inst.layersv[0].sampleName).toBe("");
      expect(inst.layersv[0].sampleFile).toBe("");
    }
  });

  it("produces independent clones (mutating one slot does not affect others)", () => {
    const instruments: Instrument[] = Array.from({ length: 128 }, () => ({
      coarseTune: 0,
      fineTune: 0,
      layersv: [
        {
          sampleName: "",
          sampleFile: "",
          volume: { gainCoefficient: 1.0, controlValue: 1.0, law: 0 },
          pan: 0.5,
          coarseTune: 0,
          fineTune: 0,
        },
      ],
    }));

    resetPads(instruments);

    // Mutate slot 0 and verify slot 1 is unaffected.
    instruments[0].layersv[0].sampleName = "mutated";
    expect(instruments[1].layersv[0].sampleName).toBe("");
  });
});

// ---------------------------------------------------------------------------
// assignPad tests
// ---------------------------------------------------------------------------

describe("assignPad", () => {
  function makeInstruments(): Instrument[] {
    return Array.from({ length: 128 }, () => ({
      coarseTune: 0,
      fineTune: 0,
      layersv: [
        {
          sampleName: "",
          sampleFile: "",
          volume: { gainCoefficient: 1.0, controlValue: 1.0, law: 0 },
          pan: 0.5,
          coarseTune: 0,
          fineTune: 0,
        },
      ],
    }));
  }

  it("sets sampleName and sampleFile on the correct globalPadIdx", () => {
    const instruments = makeInstruments();
    const pad = makePad(3, "kick.wav");
    assignPad(instruments, pad);

    expect(instruments[3].layersv[0].sampleName).toBe("kick");
    expect(instruments[3].layersv[0].sampleFile).toBe("kick.wav");
  });

  it("sets coarseTune and fineTune at instrument level", () => {
    const instruments = makeInstruments();
    const pad = makePad(5, "snare.wav", { coarseTune: -2, fineTune: 50 });
    assignPad(instruments, pad);

    expect(instruments[5].coarseTune).toBe(-2);
    expect(instruments[5].fineTune).toBe(50);
  });

  it("sets coarseTune and fineTune at layer level", () => {
    const instruments = makeInstruments();
    const pad = makePad(7, "hat.wav", { coarseTune: 3, fineTune: -25 });
    assignPad(instruments, pad);

    expect(instruments[7].layersv[0].coarseTune).toBe(3);
    expect(instruments[7].layersv[0].fineTune).toBe(-25);
  });

  it("wraps gainCoefficient with floatTag (serialises with decimal point)", () => {
    const instruments = makeInstruments();
    const pad = makePad(0, "kick.wav", { gainCoefficient: 1.0 });
    assignPad(instruments, pad);

    const serialised = serializeJson({
      v: instruments[0].layersv[0].volume,
    });
    expect(serialised).toContain('"gainCoefficient":1.0');
    expect(serialised).toContain('"controlValue":1.0');
  });

  it("wraps pan with floatTag (serialises with decimal point for 0.5)", () => {
    const instruments = makeInstruments();
    const pad = makePad(0, "kick.wav", { pan: 0.5 });
    assignPad(instruments, pad);

    const serialised = serializeJson({ pan: instruments[0].layersv[0].pan });
    expect(serialised).toBe('{"pan":0.5}');
  });

  it("wraps integer pan value with floatTag (1 → 1.0)", () => {
    const instruments = makeInstruments();
    const pad = makePad(0, "kick.wav", { pan: 1 });
    assignPad(instruments, pad);

    const serialised = serializeJson({ pan: instruments[0].layersv[0].pan });
    expect(serialised).toBe('{"pan":1.0}');
  });

  it("throws RangeError for out-of-bounds globalPadIdx", () => {
    const instruments = makeInstruments();
    const pad = makePad(200, "x.wav");
    expect(() => assignPad(instruments, pad)).toThrow(RangeError);
  });

  it("does not affect other pad slots", () => {
    const instruments = makeInstruments();
    const pad = makePad(10, "perc.wav");
    assignPad(instruments, pad);

    expect(instruments[9].layersv[0].sampleName).toBe("");
    expect(instruments[11].layersv[0].sampleName).toBe("");
  });
});

// ---------------------------------------------------------------------------
// makeSampleEntry tests
// ---------------------------------------------------------------------------

describe("makeSampleEntry", () => {
  it("returns correct structure", () => {
    const pad = makePad(0, "kick.wav");
    const kit = makeKit([pad]);
    const entry = makeSampleEntry(pad, kit);

    expect(entry.version).toBe(1);
    expect(entry.name).toBe("kick");
    expect(entry.path).toBe("kick.wav");
    expect(entry.loadImpl).toBe(1);
    expect(entry.metadata.rootNote).toBe(60);
    expect(entry.metadata.key).toBe("C Minor");
  });

  it("wraps tempo with floatTag (serialises 114 → 114.0)", () => {
    const pad = makePad(0, "kick.wav");
    const kit = makeKit([pad]);
    const entry = makeSampleEntry(pad, kit);

    const serialised = serializeJson({ tempo: entry.metadata.tempo });
    expect(serialised).toBe('{"tempo":114.0}');
  });

  it("wraps tune with floatTag (0 → 0.0)", () => {
    const pad = makePad(0, "kick.wav");
    const kit = makeKit([pad]);
    const entry = makeSampleEntry(pad, kit);

    const serialised = serializeJson({ tune: entry.metadata.tune });
    expect(serialised).toBe('{"tune":0.0}');
  });
});

// ---------------------------------------------------------------------------
// buildXpj tests
// ---------------------------------------------------------------------------

describe("buildXpj", () => {
  it("sets sampleName/sampleFile at the correct globalPadIdx", async () => {
    const pad0 = makePad(0, "kick.wav");
    const pad15 = makePad(15, "snare.wav");
    const kit = makeKit([pad0, pad15]);

    const bytes = new Map([
      ["kick.wav", makeBytes("kick")],
      ["snare.wav", makeBytes("snare")],
    ]);

    const tmpl = await loadTemplate();
    const { xpjBytes } = buildXpj(tmpl, kit, bytes);

    const { data } = decodeXpj(xpjBytes);
    const instruments = getInstruments(data.data);

    expect(instruments[0].layersv[0].sampleName).toBe("kick");
    expect(instruments[0].layersv[0].sampleFile).toBe("kick.wav");
    expect(instruments[15].layersv[0].sampleName).toBe("snare");
    expect(instruments[15].layersv[0].sampleFile).toBe("snare.wav");
  });

  it("unpopulated pad slots remain blank after reset", async () => {
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);

    const bytes = new Map([["kick.wav", makeBytes("kick")]]);

    const tmpl = await loadTemplate();
    const { xpjBytes } = buildXpj(tmpl, kit, bytes);
    const { data } = decodeXpj(xpjBytes);
    const instruments = getInstruments(data.data);

    expect(instruments[1].layersv[0].sampleName).toBe("");
    expect(instruments[127].layersv[0].sampleName).toBe("");
  });

  it("data.samples length equals unique file count (2 pads, 2 files)", async () => {
    const pad0 = makePad(0, "kick.wav");
    const pad1 = makePad(1, "snare.wav");
    const kit = makeKit([pad0, pad1]);

    const bytes = new Map([
      ["kick.wav", makeBytes("kick")],
      ["snare.wav", makeBytes("snare")],
    ]);

    const tmpl = await loadTemplate();
    const { xpjBytes } = buildXpj(tmpl, kit, bytes);
    const { data } = decodeXpj(xpjBytes);

    expect(getSamples(data.data)).toHaveLength(2);
    expect(getTrackSamples(data.data)).toHaveLength(2);
  });

  it("de-duplication: two pads sharing the same fileName produce one sample entry", async () => {
    // Pad 0 and pad 1 both use the same WAV file.
    const pad0 = makePad(0, "shared.wav", {
      sampleName: "shared-a",
      sampleId: "id-0",
    });
    const pad1 = makePad(1, "shared.wav", {
      sampleName: "shared-b",
      sampleId: "id-1",
    });
    const kit = makeKit([pad0, pad1]);

    const bytes = new Map([["shared.wav", makeBytes("shared")]]);

    const tmpl = await loadTemplate();
    const { xpjBytes, sampleFiles } = buildXpj(tmpl, kit, bytes);
    const { data } = decodeXpj(xpjBytes);

    // Only one entry in sample arrays (de-duped by path).
    expect(getSamples(data.data)).toHaveLength(1);
    expect(getTrackSamples(data.data)).toHaveLength(1);

    // Only one file in sampleFiles.
    expect(sampleFiles).toHaveLength(1);
    expect(sampleFiles[0].path).toBe("shared.wav");
  });

  it("track.name equals kit.exportName", async () => {
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0], { exportName: "London Full" });

    const bytes = new Map([["kick.wav", makeBytes("kick")]]);

    const tmpl = await loadTemplate();
    const { xpjBytes } = buildXpj(tmpl, kit, bytes);
    const { data } = decodeXpj(xpjBytes);

    const tracks = data.data.tracks as Array<Record<string, unknown>>;
    expect(tracks[0].name).toBe("London Full");
  });

  it("projectName equals kit.exportName", async () => {
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0], { exportName: "London Deluxe" });

    const bytes = new Map([["kick.wav", makeBytes("kick")]]);

    const tmpl = await loadTemplate();
    const { projectName } = buildXpj(tmpl, kit, bytes);
    expect(projectName).toBe("London Deluxe");
  });

  it("sampleFiles returns correct bytes for each unique file", async () => {
    const pad0 = makePad(0, "kick.wav");
    const pad1 = makePad(1, "snare.wav");
    const kit = makeKit([pad0, pad1]);

    const kickBytes = makeBytes("kick");
    const snareBytes = makeBytes("snare");
    const bytes = new Map([
      ["kick.wav", kickBytes],
      ["snare.wav", snareBytes],
    ]);

    const tmpl = await loadTemplate();
    const { sampleFiles } = buildXpj(tmpl, kit, bytes);

    expect(sampleFiles).toHaveLength(2);
    const byPath = new Map(
      sampleFiles.map((f: { path: string; bytes: Uint8Array }) => [f.path, f.bytes]),
    );
    expect(byPath.get("kick.wav")).toBe(kickBytes);
    expect(byPath.get("snare.wav")).toBe(snareBytes);
  });

  it("throws an Error if bytes are missing for a pad", async () => {
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);

    // Provide no bytes.
    const bytes = new Map<string, Uint8Array>();

    const tmpl = await loadTemplate();
    expect(() => buildXpj(tmpl, kit, bytes)).toThrow(/kick\.wav/);
  });

  it("does not mutate the passed-in template", async () => {
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);
    const bytes = new Map([["kick.wav", makeBytes("kick")]]);

    const tmpl = await loadTemplate();
    const tracksBefore = JSON.stringify(
      (tmpl.data.tracks as Array<Record<string, unknown>>)[0].name,
    );

    buildXpj(tmpl, kit, bytes);

    const tracksAfter = JSON.stringify(
      (tmpl.data.tracks as Array<Record<string, unknown>>)[0].name,
    );
    expect(tracksAfter).toBe(tracksBefore);
  });

  it("round-trip: decodeXpj(xpjBytes) produces parseable data", async () => {
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);
    const bytes = new Map([["kick.wav", makeBytes("kick")]]);

    const tmpl = await loadTemplate();
    const { xpjBytes } = buildXpj(tmpl, kit, bytes);

    expect(() => decodeXpj(xpjBytes)).not.toThrow();
  });

  it("handles bank-E pad at globalPadIdx=72 correctly", async () => {
    // globalPadIdx 72 = bank E (72 >> 4 = 4, zero-indexed)
    const padE = makePad(72, "perc.wav");
    const kit = makeKit([padE]);
    const bytes = new Map([["perc.wav", makeBytes("perc")]]);

    const tmpl = await loadTemplate();
    const { xpjBytes } = buildXpj(tmpl, kit, bytes);
    const { data } = decodeXpj(xpjBytes);
    const instruments = getInstruments(data.data);

    expect(instruments[72].layersv[0].sampleName).toBe("perc");
    expect(instruments[72].layersv[0].sampleFile).toBe("perc.wav");
    expect(instruments[71].layersv[0].sampleName).toBe("");
    expect(instruments[73].layersv[0].sampleName).toBe("");
  });

  it("writes a non-zero sampleEnd (and sliceInfo.End) from the WAV frame count", async () => {
    // Regression guard: the MPC treats sampleEnd=0 as a zero-length region that
    // never plays. The exported pad must carry the sample's full frame count.
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);
    const bytes = new Map([["kick.wav", makeWav(2048)]]);

    const tmpl = await loadTemplate();
    const { xpjBytes } = buildXpj(tmpl, kit, bytes);
    const { data } = decodeXpj(xpjBytes);
    const layer = getInstruments(data.data)[0].layersv[0];

    expect(layer.sampleStart).toBe(0);
    expect(layer.sampleEnd).toBe(2048);
    expect(layer.sliceInfo?.Start).toBe(0);
    expect(layer.sliceInfo?.End).toBe(2048);
  });

  it("pads with tune overrides are written to layersv[0]", async () => {
    const pad0 = makePad(0, "kick.wav", { coarseTune: -3, fineTune: 25 });
    const kit = makeKit([pad0]);
    const bytes = new Map([["kick.wav", makeBytes("kick")]]);

    const tmpl = await loadTemplate();
    const { xpjBytes } = buildXpj(tmpl, kit, bytes);
    const { data } = decodeXpj(xpjBytes);
    const instruments = getInstruments(data.data);

    expect(instruments[0].coarseTune).toBe(-3);
    expect(instruments[0].fineTune).toBe(25);
    expect(instruments[0].layersv[0].coarseTune).toBe(-3);
    expect(instruments[0].layersv[0].fineTune).toBe(25);
  });

  // Regression guard for the fatal "parameter length" hardware load failure:
  // the encoded payload must keep the format's float tokens (1.0, 0.0, …)
  // intact. A JSON round-trip would strip them all to bare integers.
  it("encoded payload preserves the template's float tokens", async () => {
    const pad0 = makePad(0, "kick.wav", { gainCoefficient: 1.0, pan: 0.5 });
    const kit = makeKit([pad0]);
    const bytes = new Map([["kick.wav", makeBytes("kick")]]);

    const tmpl = await loadTemplate();
    const { xpjBytes } = buildXpj(tmpl, kit, bytes);

    const text = new TextDecoder().decode(gunzipSync(xpjBytes));
    const floatTokens = (text.match(/:-?\d+\.0\b/g) || []).length;

    // The full template carries tens of thousands of integer-valued floats.
    expect(floatTokens).toBeGreaterThan(40000);

    // The assigned pad's float fields render with a decimal point.
    expect(text).toContain('"gainCoefficient":1.0');
    expect(text).toContain('"pan":0.5');
  });
});
