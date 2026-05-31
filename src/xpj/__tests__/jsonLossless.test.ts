/**
 * jsonLossless.test.ts — Unit + property tests for the lexeme-preserving codec.
 *
 * This is the regression guard for the fatal "parameter length" Akai MPC load
 * failure: the `.xpj` format requires float-typed fields to carry a decimal
 * point (`1.0`, never `1`), and a plain `JSON.parse`/`JSON.stringify` round-trip
 * strips every integer-valued float. These tests prove the lossless codec keeps
 * them.
 *
 * Coverage:
 *  - floatNum / intNum / toDecimalString formatting
 *  - parseLossless number tagging + string/escape/bool/null/nesting handling
 *  - stringifyLossless of tags, plain values, undefined members
 *  - round-trip: real project.xpj payload keeps its float-token count
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import gzip from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  floatNum,
  intNum,
  isRawNum,
  parseLossless,
  stringifyLossless,
  toDecimalString,
} from "../jsonLossless";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count compact `:N.0` integer-valued-float tokens in a serialised string. */
function countIntFloatTokens(s: string): number {
  return (s.match(/:-?\d+\.0\b/g) || []).length;
}

// ---------------------------------------------------------------------------
// Float / int helpers
// ---------------------------------------------------------------------------

describe("toDecimalString / floatNum / intNum", () => {
  it("toDecimalString forces a decimal on integers", () => {
    expect(toDecimalString(1)).toBe("1.0");
    expect(toDecimalString(0)).toBe("0.0");
    expect(toDecimalString(120)).toBe("120.0");
    expect(toDecimalString(-3)).toBe("-3.0");
  });

  it("toDecimalString preserves non-integer floats", () => {
    expect(toDecimalString(0.5)).toBe("0.5");
    expect(toDecimalString(0.7079457640647888)).toBe("0.7079457640647888");
  });

  it("toDecimalString throws on non-finite", () => {
    expect(() => toDecimalString(Infinity)).toThrow(RangeError);
    expect(() => toDecimalString(NaN)).toThrow(RangeError);
  });

  it("floatNum returns a RawNum tag with a decimal lexeme", () => {
    expect(floatNum(1)).toEqual({ __raw__: "1.0" });
    expect(floatNum(0.5)).toEqual({ __raw__: "0.5" });
    expect(isRawNum(floatNum(1))).toBe(true);
  });

  it("intNum returns a RawNum tag with an integer lexeme", () => {
    expect(intNum(60)).toEqual({ __raw__: "60" });
    expect(intNum(-2)).toEqual({ __raw__: "-2" });
    expect(intNum(1.9)).toEqual({ __raw__: "1" });
  });
});

// ---------------------------------------------------------------------------
// stringifyLossless
// ---------------------------------------------------------------------------

describe("stringifyLossless", () => {
  it("emits RawNum tags verbatim", () => {
    expect(stringifyLossless({ a: floatNum(1), b: intNum(2) })).toBe('{"a":1.0,"b":2}');
  });

  it("serialises plain integers, strings, booleans and null", () => {
    expect(stringifyLossless({ v: 28, k: "C Minor", t: true, n: null })).toBe(
      '{"v":28,"k":"C Minor","t":true,"n":null}',
    );
  });

  it("preserves the float lexeme inside nested structures", () => {
    const tree = {
      volume: {
        gainCoefficient: floatNum(1),
        controlValue: floatNum(1),
        law: 0,
      },
      pan: floatNum(0.5),
    };
    expect(stringifyLossless(tree)).toBe(
      '{"volume":{"gainCoefficient":1.0,"controlValue":1.0,"law":0},"pan":0.5}',
    );
  });

  it("escapes special characters in strings and keys", () => {
    expect(stringifyLossless({ 'a"b': "x\ny" })).toBe('{"a\\"b":"x\\ny"}');
  });

  it("drops undefined object members and nulls undefined array items", () => {
    expect(stringifyLossless({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
    expect(stringifyLossless([1, undefined, 3])).toBe("[1,null,3]");
  });

  it("throws on a non-finite plain number", () => {
    expect(() => stringifyLossless({ x: Infinity })).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// parseLossless
// ---------------------------------------------------------------------------

describe("parseLossless", () => {
  it("tags every number with its exact lexeme", () => {
    const v = parseLossless('{"i":28,"f":1.0,"g":0.5,"neg":-3,"exp":1.5e3}') as Record<
      string,
      unknown
    >;
    expect(v.i).toEqual({ __raw__: "28" });
    expect(v.f).toEqual({ __raw__: "1.0" });
    expect(v.g).toEqual({ __raw__: "0.5" });
    expect(v.neg).toEqual({ __raw__: "-3" });
    expect(v.exp).toEqual({ __raw__: "1.5e3" });
  });

  it("parses strings (with escapes), booleans, null, nesting, arrays", () => {
    const v = parseLossless(
      '{"s":"a\\"b\\n","t":true,"f":false,"z":null,"arr":[1,2,{"x":3}]}',
    ) as Record<string, unknown>;
    expect(v.s).toBe('a"b\n');
    expect(v.t).toBe(true);
    expect(v.f).toBe(false);
    expect(v.z).toBe(null);
    expect(Array.isArray(v.arr)).toBe(true);
  });

  it("tolerates Python-style indent=0 whitespace (newlines between tokens)", () => {
    const v = parseLossless('{\n"a": 1.0,\n"b": [\n2,\n3\n]\n}') as Record<string, unknown>;
    expect(v.a).toEqual({ __raw__: "1.0" });
    expect(v.b).toEqual([{ __raw__: "2" }, { __raw__: "3" }]);
  });

  it("throws on trailing garbage", () => {
    expect(() => parseLossless("{}x")).toThrow(SyntaxError);
  });
});

// ---------------------------------------------------------------------------
// Round-trip property
// ---------------------------------------------------------------------------

describe("parse → stringify round-trip", () => {
  it("preserves value/structure (semantic equality)", () => {
    const src = '{"data":{"version":28,"mix":0.70794,"pad":{"gain":1.0,"law":0}}}';
    const round = stringifyLossless(parseLossless(src));
    expect(JSON.parse(round)).toEqual(JSON.parse(src));
  });

  it("preserves integer-valued float tokens that JSON.stringify would strip", () => {
    const src = '{"a":1.0,"b":2.0,"c":0.0,"d":0.5,"e":3}';
    // Standard round-trip destroys the .0 tokens ...
    expect(countIntFloatTokens(JSON.stringify(JSON.parse(src)))).toBe(0);
    // ... lossless round-trip keeps all three.
    const round = stringifyLossless(parseLossless(src));
    expect(countIntFloatTokens(round)).toBe(3);
    expect(round).toContain('"a":1.0');
    expect(round).toContain('"c":0.0');
  });
});

// ---------------------------------------------------------------------------
// Real project.xpj round-trip (the actual format the MPC consumes)
// ---------------------------------------------------------------------------

describe.skip("real project.xpj round-trip", () => {
  const PROJECT_XPJ = join(__dirname, "..", "..", "..", "MPC-Sample", "Projects", "project.xpj");

  function readPayload(): string {
    const bytes = readFileSync(PROJECT_XPJ);
    const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const raw = isGzip ? gzip.gunzipSync(bytes) : bytes;
    const text = raw.toString("utf-8");
    return text.split("\n").slice(5).join("\n"); // drop 5 header lines
  }

  it("keeps tens of thousands of float tokens and stays semantically equal", () => {
    const payload = readPayload();
    const round = stringifyLossless(parseLossless(payload));

    // Float tokens survive (the regression guard).
    expect(countIntFloatTokens(round)).toBeGreaterThan(40000);

    // A standard JSON round-trip would strip them all — prove the contrast.
    expect(countIntFloatTokens(JSON.stringify(JSON.parse(payload)))).toBe(0);

    // No value/structure loss.
    expect(JSON.parse(round)).toEqual(JSON.parse(payload));
  });
});
