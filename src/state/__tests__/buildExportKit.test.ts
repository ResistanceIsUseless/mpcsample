/**
 * buildExportKit.test.ts — unit tests for the buildExportKit pure helper.
 *
 * buildExportKit derives the kit to export from the live padMap rather than
 * the stale activeKit.pads snapshot, so that:
 *   • Dropped WAVs (url=null) are included even in blank projects.
 *   • Per-pad customisations (tune, gain, rename, swap/move) are exported.
 */

import { describe, expect, it } from "vitest";
import type { SampleKit, SamplePad } from "../../kits/kit.types";
import { buildExportKit } from "../store";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePad(idx: number, overrides?: Partial<SamplePad>): SamplePad {
  return {
    globalPadIdx: idx,
    sampleId: `sid-${idx}`,
    displayName: `Pad ${idx}`,
    sampleName: `sample${idx}.wav`,
    fileName: `sample${idx}.wav`,
    url: `/kits/test/sample${idx}.wav`,
    coarseTune: 0,
    fineTune: 0,
    gainCoefficient: 1.0,
    pan: 0.5,
    ...overrides,
  };
}

const BASE_KIT: SampleKit = {
  id: "test-kit",
  displayName: "Test Kit",
  exportName: "TestKit",
  key: "C Minor",
  bpm: 114,
  pads: [makePad(0), makePad(1)],
};

function emptyPadMap(): Record<number, SamplePad | null> {
  return Object.fromEntries(Array.from({ length: 128 }, (_, i) => [i, null]));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildExportKit", () => {
  it("returns null when activeKit is null", () => {
    expect(buildExportKit(null, emptyPadMap())).toBeNull();
  });

  it("returns null when padMap has no populated pads", () => {
    expect(buildExportKit(BASE_KIT, emptyPadMap())).toBeNull();
  });

  it("returns null even if activeKit has pads when padMap is empty", () => {
    // activeKit.pads is stale; padMap is the source of truth.
    const kitWithPads = { ...BASE_KIT, pads: [makePad(0)] };
    expect(buildExportKit(kitWithPads, emptyPadMap())).toBeNull();
  });

  it("returns a kit with pads from padMap (not activeKit.pads)", () => {
    const padMap = emptyPadMap();
    padMap[3] = makePad(3);
    padMap[7] = makePad(7);

    // activeKit.pads has different pads (from initial load) — should be ignored.
    const staleKit = { ...BASE_KIT, pads: [makePad(0), makePad(1)] };
    const result = buildExportKit(staleKit, padMap);

    expect(result).not.toBeNull();
    expect(result?.pads).toHaveLength(2);
    expect(result?.pads.map((p) => p.globalPadIdx)).toEqual([3, 7]);
  });

  it("sorts pads by globalPadIdx ascending", () => {
    const padMap = emptyPadMap();
    padMap[10] = makePad(10);
    padMap[2] = makePad(2);
    padMap[5] = makePad(5);

    const result = buildExportKit(BASE_KIT, padMap);
    expect(result?.pads.map((p) => p.globalPadIdx)).toEqual([2, 5, 10]);
  });

  it("carries all SampleKit metadata from activeKit", () => {
    const padMap = emptyPadMap();
    padMap[0] = makePad(0);

    const result = buildExportKit(BASE_KIT, padMap);
    expect(result?.id).toBe(BASE_KIT.id);
    expect(result?.displayName).toBe(BASE_KIT.displayName);
    expect(result?.exportName).toBe(BASE_KIT.exportName);
    expect(result?.key).toBe(BASE_KIT.key);
    expect(result?.bpm).toBe(BASE_KIT.bpm);
  });

  it("includes user-imported (url=null) pads from padMap (regression: new project + drop)", () => {
    // Simulates: blank project (activeKit.pads=[]) + WAV dropped onto pad 0.
    const blankKit: SampleKit = {
      id: "new",
      displayName: "New Kit",
      exportName: "New Kit",
      key: "",
      bpm: 120,
      pads: [], // blank — as created by loadBlankKit
    };

    const droppedPad = makePad(0, { url: null, sampleId: "user:kick.wav" });
    const padMap = emptyPadMap();
    padMap[0] = droppedPad;

    const result = buildExportKit(blankKit, padMap);
    expect(result).not.toBeNull();
    expect(result?.pads).toHaveLength(1);
    expect(result?.pads[0].sampleId).toBe("user:kick.wav");
    expect(result?.pads[0].url).toBeNull();
  });

  it("reflects customised pad properties from padMap (not the original activeKit snapshot)", () => {
    // Start with a preset pad loaded from a kit manifest.
    const originalPad = makePad(4, { coarseTune: 0, sampleName: "original.wav" });
    const loadedKit = { ...BASE_KIT, pads: [originalPad] };

    // After loadKit, padMap is built from the kit.  User then customises the pad.
    const customisedPad: SamplePad = {
      ...originalPad,
      coarseTune: 7, // setPadTune
      sampleName: "renamed", // setPadName
      displayName: "renamed",
    };

    const padMap = emptyPadMap();
    padMap[4] = customisedPad;

    const result = buildExportKit(loadedKit, padMap);
    expect(result?.pads[0].coarseTune).toBe(7);
    expect(result?.pads[0].sampleName).toBe("renamed");
  });
});
