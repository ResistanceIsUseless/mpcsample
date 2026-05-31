/**
 * codec.test.ts — Unit tests for XPJ encode/decode + float serialisation.
 *
 * Test coverage:
 *  - Round-trip: decodeXpj(encodeXpj(data)) deep-equals the original data
 *  - Header: encoded bytes gunzip to the expected header prefix
 *  - Float format: serializeJson with floatTag emits decimal point
 *  - loadTemplate: returns an object with 128-instrument drum track
 *  - decodeXpj: accepts uncompressed (plain) input
 *  - decodeXpj: throws on malformed input
 */

import { gunzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  decodeXpj,
  encodeXpj,
  floatTag,
  loadTemplate,
  serializeJson,
  XPJ_HEADER,
  type XpjData,
} from "../codec";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeFixture(): XpjData {
  return {
    data: {
      version: 28,
      key: "C Minor",
      samples: [],
      tracks: [
        {
          name: "TestKit",
          program: {
            type: 0,
            drum: {
              instruments: Array.from({ length: 3 }, (_, i) => ({
                coarseTune: i,
                fineTune: 0,
                layersv: [{ sampleName: `s${i}`, sampleFile: `s${i}.wav` }],
              })),
            },
          },
          samples: [],
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe("encodeXpj / decodeXpj round-trip", () => {
  it("decodeXpj(encodeXpj(data)) deep-equals original data", () => {
    const original = makeFixture();
    const encoded = encodeXpj(original);
    const { data } = decodeXpj(encoded);
    expect(data).toEqual(original);
  });

  it("encodeXpj returns a Uint8Array", () => {
    const encoded = encodeXpj(makeFixture());
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);
  });

  it("encoded bytes start with gzip magic bytes 0x1f 0x8b", () => {
    const encoded = encodeXpj(makeFixture());
    expect(encoded[0]).toBe(0x1f);
    expect(encoded[1]).toBe(0x8b);
  });
});

// ---------------------------------------------------------------------------
// Header tests
// ---------------------------------------------------------------------------

describe("XPJ header", () => {
  it("gunzipped bytes start with 'ACVS\\n1.3.0.12\\n'", () => {
    const encoded = encodeXpj(makeFixture());
    const raw = gunzipSync(encoded);
    const text = new TextDecoder().decode(raw);
    expect(text.startsWith("ACVS\n1.3.0.12\n")).toBe(true);
  });

  it("gunzipped header contains all 5 expected lines", () => {
    const encoded = encodeXpj(makeFixture());
    const raw = gunzipSync(encoded);
    const text = new TextDecoder().decode(raw);
    const lines = text.split("\n");
    expect(lines[0]).toBe("ACVS");
    expect(lines[1]).toBe("1.3.0.12");
    expect(lines[2]).toBe("SerialisableProjectData");
    expect(lines[3]).toBe("json");
    expect(lines[4]).toBe("Linux");
  });

  it("XPJ_HEADER constant has 5 elements", () => {
    expect(XPJ_HEADER).toHaveLength(5);
    expect(XPJ_HEADER[0]).toBe("ACVS");
    expect(XPJ_HEADER[4]).toBe("Linux");
  });

  it("decoded header matches XPJ_HEADER", () => {
    const encoded = encodeXpj(makeFixture());
    const { header } = decodeXpj(encoded);
    expect(header).toEqual([...XPJ_HEADER]);
  });
});

// ---------------------------------------------------------------------------
// Float format tests
// ---------------------------------------------------------------------------

describe("serializeJson + floatTag", () => {
  it("integer wrapped in floatTag emits decimal point (1 → 1.0)", () => {
    const result = serializeJson({ a: floatTag(1) });
    expect(result).toBe('{"a":1.0}');
  });

  it("0 wrapped in floatTag emits 0.0", () => {
    const result = serializeJson({ tune: floatTag(0) });
    expect(result).toBe('{"tune":0.0}');
  });

  it("BPM 120 wrapped in floatTag emits 120.0", () => {
    const result = serializeJson({ tempo: floatTag(120) });
    expect(result).toBe('{"tempo":120.0}');
  });

  it("non-integer float is preserved as-is (0.5 stays 0.5)", () => {
    const result = serializeJson({ pan: floatTag(0.5) });
    expect(result).toBe('{"pan":0.5}');
  });

  it("non-integer float 114.0 stays 114 (no extra .0 added)", () => {
    // 114 as integer → 114.0 via toFixed
    const result = serializeJson({ bpm: floatTag(114) });
    expect(result).toBe('{"bpm":114.0}');
  });

  it("plain integer without floatTag is unchanged", () => {
    const result = serializeJson({ version: 28 });
    expect(result).toBe('{"version":28}');
  });

  it("plain string without floatTag is unchanged", () => {
    const result = serializeJson({ key: "C Minor" });
    expect(result).toBe('{"key":"C Minor"}');
  });

  it("nested floatTag objects are serialised correctly", () => {
    const result = serializeJson({
      volume: {
        gainCoefficient: floatTag(1),
        controlValue: floatTag(1),
        law: 0,
      },
      pan: floatTag(0.5),
    });
    expect(result).toBe('{"volume":{"gainCoefficient":1.0,"controlValue":1.0,"law":0},"pan":0.5}');
  });

  it("floatTag on a non-finite value throws RangeError", () => {
    expect(() => serializeJson({ x: floatTag(Infinity) })).toThrow(RangeError);
    expect(() => serializeJson({ x: floatTag(NaN) })).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// decodeXpj with plain (uncompressed) input
// ---------------------------------------------------------------------------

describe("decodeXpj with plain (uncompressed) input", () => {
  it("accepts plain text input without gzip magic", () => {
    const fixture = makeFixture();
    const payload = `${XPJ_HEADER.join("\n")}\n${JSON.stringify(fixture)}`;
    const plain = new TextEncoder().encode(payload);
    // plain bytes do NOT start with gzip magic
    expect(plain[0]).not.toBe(0x1f);

    const { header, data } = decodeXpj(plain);
    expect(header).toEqual([...XPJ_HEADER]);
    expect(data).toEqual(fixture);
  });
});

// ---------------------------------------------------------------------------
// decodeXpj error cases
// ---------------------------------------------------------------------------

describe("decodeXpj error cases", () => {
  it("throws on malformed input with fewer than 6 newline-delimited parts", () => {
    const short = new TextEncoder().encode("ACVS\n1.3.0.12\n");
    // plain (not gzip), only 3 parts
    expect(() => decodeXpj(short)).toThrow(/Invalid XPJ/);
  });
});

// ---------------------------------------------------------------------------
// loadTemplate
// ---------------------------------------------------------------------------

describe("loadTemplate", () => {
  it("returns an object with data.tracks[0].program.drum.instruments of length 128", async () => {
    const tmpl = await loadTemplate();
    expect(tmpl).toBeDefined();
    expect(typeof tmpl.data).toBe("object");

    const tracks = tmpl.data.tracks as Array<Record<string, unknown>>;
    expect(Array.isArray(tracks)).toBe(true);

    const program = tracks[0].program as Record<string, unknown>;
    const drum = program.drum as Record<string, unknown>;
    const instruments = drum.instruments as unknown[];
    expect(instruments).toHaveLength(128);
  });

  it("returns a new clone on each call (mutations do not affect future calls)", async () => {
    const a = await loadTemplate();
    const b = await loadTemplate();

    const tracksA = a.data.tracks as Array<Record<string, unknown>>;
    tracksA[0].name = "mutated";

    const tracksB = b.data.tracks as Array<Record<string, unknown>>;
    expect(tracksB[0].name).not.toBe("mutated");
  });

  it("round-trip through encodeXpj/decodeXpj without throwing", async () => {
    const tmpl = await loadTemplate();
    expect(() => decodeXpj(encodeXpj(tmpl))).not.toThrow();
  });
});
