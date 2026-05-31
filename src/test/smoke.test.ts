import { describe, expect, it } from "vitest";
import { KIT_NAMES, LED_COLORS } from "../data/ledColors";
import { KEY_TO_IDX, PADS, TOTAL_PADS } from "../data/padLayout";

describe("padLayout", () => {
  it("has 16 pads indexed 0..15", () => {
    expect(PADS).toHaveLength(TOTAL_PADS);
    for (let i = 0; i < 16; i++) {
      expect(PADS[i].idx).toBe(i);
    }
  });

  it("maps all keys to a pad index", () => {
    const keys = ["z", "x", "c", "v", "a", "s", "d", "f", "q", "w", "e", "r", "1", "2", "3", "4"];
    for (const k of keys) {
      expect(KEY_TO_IDX[k]).toBeGreaterThanOrEqual(0);
      expect(KEY_TO_IDX[k]).toBeLessThan(16);
    }
  });

  it("has unique keys for each pad", () => {
    const keys = Object.keys(KEY_TO_IDX);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("ledColors", () => {
  it("has all five LED colors", () => {
    expect(Object.keys(LED_COLORS)).toEqual(["BLUE", "GREEN", "PURPLE", "ORANGE", "RED"]);
  });

  it("each palette has ring, press, press2", () => {
    for (const palette of Object.values(LED_COLORS)) {
      expect(palette.ring).toMatch(/^#/);
      expect(palette.press).toMatch(/^#/);
      expect(palette.press2).toMatch(/^#/);
    }
  });

  it("has five kit names", () => {
    expect(KIT_NAMES).toEqual(["HIP-HOP", "TRAP", "HOUSE", "TR-808", "TR-909"]);
  });
});
