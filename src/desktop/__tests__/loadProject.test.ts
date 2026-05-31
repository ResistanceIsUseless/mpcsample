/**
 * loadProject.test.ts — Unit tests for `loadProjectFromDir` and `loadBlankKit`.
 *
 * All external dependencies are mocked:
 *  - `../bridge` → `isDesktop`, `desktop`
 *  - `../../state/store` → `useMPCStore`
 *  - `../../xpj/readXpj` → `parseXpjToKit`
 *
 * The `registerImportedSample` on the engine mock is async so the
 * implementation can await it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SampleKit, SamplePad } from "../../kits/kit.types";

// ---------------------------------------------------------------------------
// Mock: bridge
// ---------------------------------------------------------------------------

const mockChooseProjectDir = vi.fn<() => Promise<string | null>>();
const mockReadProject = vi.fn();

vi.mock("../bridge", () => ({
  isDesktop: () => true,
  desktop: () => ({
    chooseProjectDir: mockChooseProjectDir,
    readProject: mockReadProject,
  }),
}));

// ---------------------------------------------------------------------------
// Mock: store
// ---------------------------------------------------------------------------

const mockRegisterUserSample = vi.fn();
const mockLoadKit = vi.fn();
const mockRegisterImportedSample = vi.fn().mockResolvedValue(undefined);

const mockEngine = {
  registerImportedSample: mockRegisterImportedSample,
};

let mockEngineRef: typeof mockEngine | null = mockEngine;

vi.mock("../../state/store", () => ({
  useMPCStore: {
    getState: () => ({
      registerUserSample: mockRegisterUserSample,
      loadKit: mockLoadKit,
      engineRef: mockEngineRef,
    }),
  },
}));

// ---------------------------------------------------------------------------
// Mock: readXpj — returns a predictable kit
// ---------------------------------------------------------------------------

const mockParseXpjToKit = vi.fn<(bytes: Uint8Array, name: string) => SampleKit>();

vi.mock("../../xpj/readXpj", () => ({
  parseXpjToKit: (bytes: Uint8Array, name: string) => mockParseXpjToKit(bytes, name),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePad(
  globalPadIdx: number,
  fileName: string,
  overrides: Partial<SamplePad> = {},
): SamplePad {
  return {
    globalPadIdx,
    sampleId: `loaded:${fileName}`,
    displayName: fileName.replace(/\.wav$/, ""),
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
    id: "loaded",
    displayName: "My Kit",
    exportName: "My Kit",
    key: "C Minor",
    bpm: 114,
    pads,
    ...overrides,
  };
}

function makeXpjBytes(label: string): Uint8Array {
  return new TextEncoder().encode(`xpj:${label}`);
}

function makeSampleBytes(fileName: string): Uint8Array {
  return new TextEncoder().encode(`wav:${fileName}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadProjectFromDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEngineRef = mockEngine;
  });

  it("calls desktop().readProject with the provided dir", async () => {
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);
    const xpjBytes = makeXpjBytes("test");
    const kickBytes = makeSampleBytes("kick.wav");

    mockReadProject.mockResolvedValue({
      dir: "/path/to/project",
      xpjBytes,
      samples: [{ fileName: "kick.wav", bytes: kickBytes }],
    });
    mockParseXpjToKit.mockReturnValue(kit);

    const { loadProjectFromDir } = await import("../loadProject");
    await loadProjectFromDir("/path/to/project");

    expect(mockReadProject).toHaveBeenCalledWith("/path/to/project");
  });

  it("calls parseXpjToKit with xpjBytes and the dir basename", async () => {
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);
    const xpjBytes = makeXpjBytes("test");
    const kickBytes = makeSampleBytes("kick.wav");

    mockReadProject.mockResolvedValue({
      dir: "/some/path/MyProject",
      xpjBytes,
      samples: [{ fileName: "kick.wav", bytes: kickBytes }],
    });
    mockParseXpjToKit.mockReturnValue(kit);

    const { loadProjectFromDir } = await import("../loadProject");
    await loadProjectFromDir("/some/path/MyProject");

    expect(mockParseXpjToKit).toHaveBeenCalledWith(xpjBytes, "MyProject");
  });

  it("registers each sample's bytes under pad.sampleId in the store", async () => {
    const pad0 = makePad(0, "kick.wav");
    const pad1 = makePad(1, "snare.wav");
    const kit = makeKit([pad0, pad1]);
    const xpjBytes = makeXpjBytes("test");
    const kickBytes = makeSampleBytes("kick.wav");
    const snareBytes = makeSampleBytes("snare.wav");

    mockReadProject.mockResolvedValue({
      dir: "/project",
      xpjBytes,
      samples: [
        { fileName: "kick.wav", bytes: kickBytes },
        { fileName: "snare.wav", bytes: snareBytes },
      ],
    });
    mockParseXpjToKit.mockReturnValue(kit);

    const { loadProjectFromDir } = await import("../loadProject");
    await loadProjectFromDir("/project");

    expect(mockRegisterUserSample).toHaveBeenCalledWith("loaded:kick.wav", kickBytes);
    expect(mockRegisterUserSample).toHaveBeenCalledWith("loaded:snare.wav", snareBytes);
  });

  it("calls engine.registerImportedSample for each pad under the same sampleId", async () => {
    const pad0 = makePad(0, "kick.wav");
    const pad1 = makePad(1, "snare.wav");
    const kit = makeKit([pad0, pad1]);
    const xpjBytes = makeXpjBytes("test");
    const kickBytes = makeSampleBytes("kick.wav");
    const snareBytes = makeSampleBytes("snare.wav");

    mockReadProject.mockResolvedValue({
      dir: "/project",
      xpjBytes,
      samples: [
        { fileName: "kick.wav", bytes: kickBytes },
        { fileName: "snare.wav", bytes: snareBytes },
      ],
    });
    mockParseXpjToKit.mockReturnValue(kit);

    const { loadProjectFromDir } = await import("../loadProject");
    await loadProjectFromDir("/project");

    expect(mockRegisterImportedSample).toHaveBeenCalledWith("loaded:kick.wav", kickBytes);
    expect(mockRegisterImportedSample).toHaveBeenCalledWith("loaded:snare.wav", snareBytes);
  });

  it("de-dupes samples: two pads sharing a sampleId register bytes only once", async () => {
    // Both pads reference the same .wav → same sampleId "loaded:shared.wav"
    const pad0 = makePad(0, "shared.wav");
    const pad1 = makePad(1, "shared.wav"); // same sampleId
    const kit = makeKit([pad0, pad1]);
    const xpjBytes = makeXpjBytes("test");
    const sharedBytes = makeSampleBytes("shared.wav");

    mockReadProject.mockResolvedValue({
      dir: "/project",
      xpjBytes,
      samples: [{ fileName: "shared.wav", bytes: sharedBytes }],
    });
    mockParseXpjToKit.mockReturnValue(kit);

    const { loadProjectFromDir } = await import("../loadProject");
    await loadProjectFromDir("/project");

    // registerUserSample called exactly once for "loaded:shared.wav"
    const storeCallsForShared = mockRegisterUserSample.mock.calls.filter(
      ([id]) => id === "loaded:shared.wav",
    );
    expect(storeCallsForShared).toHaveLength(1);

    const engineCallsForShared = mockRegisterImportedSample.mock.calls.filter(
      ([id]) => id === "loaded:shared.wav",
    );
    expect(engineCallsForShared).toHaveLength(1);
  });

  it("calls store.loadKit with the parsed kit", async () => {
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);
    const xpjBytes = makeXpjBytes("test");
    const kickBytes = makeSampleBytes("kick.wav");

    mockReadProject.mockResolvedValue({
      dir: "/project",
      xpjBytes,
      samples: [{ fileName: "kick.wav", bytes: kickBytes }],
    });
    mockParseXpjToKit.mockReturnValue(kit);

    const { loadProjectFromDir } = await import("../loadProject");
    await loadProjectFromDir("/project");

    expect(mockLoadKit).toHaveBeenCalledWith(kit);
  });

  it("skips engine registration when engineRef is null (engine not started yet)", async () => {
    mockEngineRef = null;

    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);
    const xpjBytes = makeXpjBytes("test");
    const kickBytes = makeSampleBytes("kick.wav");

    mockReadProject.mockResolvedValue({
      dir: "/project",
      xpjBytes,
      samples: [{ fileName: "kick.wav", bytes: kickBytes }],
    });
    mockParseXpjToKit.mockReturnValue(kit);

    const { loadProjectFromDir } = await import("../loadProject");
    await expect(loadProjectFromDir("/project")).resolves.not.toThrow();

    // Store registration still happens; engine registration skipped.
    expect(mockRegisterUserSample).toHaveBeenCalled();
    expect(mockRegisterImportedSample).not.toHaveBeenCalled();
    // loadKit is still called.
    expect(mockLoadKit).toHaveBeenCalledWith(kit);
  });

  it("does not throw when a pad's fileName is missing from samples (warns instead)", async () => {
    const pad0 = makePad(0, "missing.wav");
    const kit = makeKit([pad0]);
    const xpjBytes = makeXpjBytes("test");

    mockReadProject.mockResolvedValue({
      dir: "/project",
      xpjBytes,
      // No samples provided — fileName missing from the data folder.
      samples: [],
    });
    mockParseXpjToKit.mockReturnValue(kit);

    const { loadProjectFromDir } = await import("../loadProject");
    await expect(loadProjectFromDir("/project")).resolves.not.toThrow();
    // loadKit still called even with missing samples.
    expect(mockLoadKit).toHaveBeenCalledWith(kit);
  });

  it("rejects when desktop().readProject rejects", async () => {
    mockReadProject.mockRejectedValue(new Error("ENOXPJ: no .xpj found"));

    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);
    mockParseXpjToKit.mockReturnValue(kit);

    const { loadProjectFromDir } = await import("../loadProject");
    await expect(loadProjectFromDir("/bad-dir")).rejects.toThrow("ENOXPJ");
  });
});

// ---------------------------------------------------------------------------
// loadBlankKit
// ---------------------------------------------------------------------------

describe("loadBlankKit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls store.loadKit with a blank kit (id='new', 0 pads)", async () => {
    const { loadBlankKit } = await import("../loadProject");
    loadBlankKit();

    expect(mockLoadKit).toHaveBeenCalledOnce();
    const [calledWith] = mockLoadKit.mock.calls[0] as [SampleKit];
    expect(calledWith.id).toBe("new");
    expect(calledWith.pads).toHaveLength(0);
    expect(calledWith.displayName).toBe("New Kit");
    expect(calledWith.exportName).toBe("New Kit");
  });

  it("blank kit has a sensible key and bpm", async () => {
    const { loadBlankKit } = await import("../loadProject");
    loadBlankKit();

    const [calledWith] = mockLoadKit.mock.calls[0] as [SampleKit];
    expect(calledWith.key).toBe("C Minor");
    expect(calledWith.bpm).toBe(120);
  });
});
