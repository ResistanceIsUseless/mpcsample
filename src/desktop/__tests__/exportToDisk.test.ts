/**
 * exportToDisk.test.ts — Unit tests for `exportKitToDisk`.
 *
 * Coverage:
 *  - default SD dir exists → writeProject called with that destDir
 *  - default SD dir missing → chooseExportDir used as destDir
 *  - chooseExportDir returns null → throws AbortError
 *  - EEXIST + onNeedOverwrite(true) → retries writeProject with overwrite:true
 *  - EEXIST + onNeedOverwrite(false) → throws AbortError (soft cancel)
 *  - EEXIST without onNeedOverwrite callback → propagates raw error
 *  - ENOENT → throws descriptive Error (not raw bridge error)
 *  - success → returns WriteProjectResult
 *  - buildProjectArtifacts errors propagate (e.g. empty kit)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SampleKit, SamplePad } from "../../kits/kit.types";

// ---------------------------------------------------------------------------
// Mock: bridge
// ---------------------------------------------------------------------------

const mockGetDefaultExportDir = vi.fn();
const mockChooseExportDir = vi.fn();
const mockWriteProject = vi.fn();

vi.mock("../bridge", () => ({
  isDesktop: () => true,
  desktop: () => ({
    getDefaultExportDir: mockGetDefaultExportDir,
    chooseExportDir: mockChooseExportDir,
    writeProject: mockWriteProject,
  }),
}));

// ---------------------------------------------------------------------------
// Mock: buildProjectArtifacts
// ---------------------------------------------------------------------------

const mockBuildProjectArtifacts = vi.fn();

vi.mock("../../xpj/exportKit", () => ({
  buildProjectArtifacts: (...args: unknown[]) => mockBuildProjectArtifacts(...args),
  // Keep other exports available (not used in exportToDisk, but export them
  // so any accidental import doesn't crash).
  exportKitToZip: vi.fn(),
  triggerDownload: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePad(idx: number): SamplePad {
  return {
    globalPadIdx: idx,
    sampleId: `sid-${idx}`,
    displayName: `Pad ${idx}`,
    sampleName: `kick${idx}`,
    fileName: `kick${idx}.wav`,
    url: `/kits/test/kick${idx}.wav`,
    coarseTune: 0,
    fineTune: 0,
    gainCoefficient: 1.0,
    pan: 0.5,
  };
}

const TEST_KIT: SampleKit = {
  id: "test-kit",
  displayName: "Test Kit",
  exportName: "TestKit",
  key: "C Minor",
  bpm: 114,
  pads: [makePad(0), makePad(1)],
};

const FAKE_ARTIFACTS = {
  projectName: "TestKit",
  xpjBytes: new Uint8Array([1, 2, 3]),
  sampleFiles: [
    { path: "kick0.wav", bytes: new Uint8Array([4, 5, 6]) },
    { path: "kick1.wav", bytes: new Uint8Array([7, 8, 9]) },
  ],
};

const WRITE_RESULT = {
  written: "/Volumes/MPC-SD/MPC-Sample/Projects/TestKit.xpj",
  dataDir: "/Volumes/MPC-SD/MPC-Sample/Projects/TestKit_[ProjectData]",
  sampleCount: 2,
};

const DEFAULT_DIR = "/Volumes/MPC-SD/MPC-Sample/Projects";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildProjectArtifacts.mockResolvedValue(FAKE_ARTIFACTS);
  mockWriteProject.mockResolvedValue(WRITE_RESULT);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("exportKitToDisk", () => {
  it("calls writeProject with the default destDir when the SD card is mounted", async () => {
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: true });

    const { exportKitToDisk } = await import("../exportToDisk");
    const result = await exportKitToDisk(TEST_KIT, new Map());

    expect(mockWriteProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: "TestKit",
        destDir: DEFAULT_DIR,
      }),
    );
    expect(result).toEqual(WRITE_RESULT);
  });

  it("calls chooseExportDir when the SD card is not mounted", async () => {
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: false });
    mockChooseExportDir.mockResolvedValue("/Users/edgar/Desktop/MPC");

    const { exportKitToDisk } = await import("../exportToDisk");
    await exportKitToDisk(TEST_KIT, new Map());

    expect(mockChooseExportDir).toHaveBeenCalled();
    expect(mockWriteProject).toHaveBeenCalledWith(
      expect.objectContaining({ destDir: "/Users/edgar/Desktop/MPC" }),
    );
  });

  it("throws AbortError when chooseExportDir returns null (picker cancelled)", async () => {
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: false });
    mockChooseExportDir.mockResolvedValue(null);

    const { exportKitToDisk } = await import("../exportToDisk");
    await expect(exportKitToDisk(TEST_KIT, new Map())).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(mockWriteProject).not.toHaveBeenCalled();
  });

  it("retries writeProject with overwrite:true when EEXIST and onNeedOverwrite returns true", async () => {
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: true });

    const eexistError = Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    // First call fails with EEXIST; second call succeeds.
    mockWriteProject.mockRejectedValueOnce(eexistError).mockResolvedValueOnce(WRITE_RESULT);

    const { exportKitToDisk } = await import("../exportToDisk");
    const result = await exportKitToDisk(TEST_KIT, new Map(), {
      onNeedOverwrite: () => Promise.resolve(true),
    });

    expect(mockWriteProject).toHaveBeenCalledTimes(2);
    expect(mockWriteProject).toHaveBeenLastCalledWith(expect.objectContaining({ overwrite: true }));
    expect(result).toEqual(WRITE_RESULT);
  });

  it("throws AbortError when EEXIST and onNeedOverwrite returns false", async () => {
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: true });

    const eexistError = Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    mockWriteProject.mockRejectedValueOnce(eexistError);

    const { exportKitToDisk } = await import("../exportToDisk");
    await expect(
      exportKitToDisk(TEST_KIT, new Map(), {
        onNeedOverwrite: () => Promise.resolve(false),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    // Should not retry writeProject.
    expect(mockWriteProject).toHaveBeenCalledTimes(1);
  });

  it("propagates EEXIST raw error when no onNeedOverwrite callback is provided", async () => {
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: true });

    const eexistError = Object.assign(new Error("EEXIST: file exists"), { code: "EEXIST" });
    mockWriteProject.mockRejectedValueOnce(eexistError);

    const { exportKitToDisk } = await import("../exportToDisk");
    await expect(exportKitToDisk(TEST_KIT, new Map())).rejects.toMatchObject({
      code: "EEXIST",
    });
  });

  it("throws a descriptive Error for ENOENT (SD card vanished mid-export)", async () => {
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: true });

    const enoentError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    mockWriteProject.mockRejectedValueOnce(enoentError);

    const { exportKitToDisk } = await import("../exportToDisk");
    await expect(exportKitToDisk(TEST_KIT, new Map())).rejects.toThrow(
      /export destination not found/i,
    );
  });

  it("propagates buildProjectArtifacts errors (e.g. empty kit)", async () => {
    mockBuildProjectArtifacts.mockRejectedValueOnce(
      new Error("empty kit: no populated pads to export."),
    );
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: true });

    const { exportKitToDisk } = await import("../exportToDisk");
    await expect(exportKitToDisk(TEST_KIT, new Map())).rejects.toThrow(/empty kit/i);

    expect(mockWriteProject).not.toHaveBeenCalled();
  });

  it("passes signal and onProgress through to buildProjectArtifacts", async () => {
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: true });

    const controller = new AbortController();
    const onProgress = vi.fn();

    const { exportKitToDisk } = await import("../exportToDisk");
    await exportKitToDisk(TEST_KIT, new Map(), {
      signal: controller.signal,
      onProgress,
    });

    expect(mockBuildProjectArtifacts).toHaveBeenCalledWith(
      TEST_KIT,
      expect.any(Map),
      expect.objectContaining({
        signal: controller.signal,
        onProgress,
      }),
    );
  });

  it("emits a 'done' progress event after a successful write", async () => {
    mockGetDefaultExportDir.mockResolvedValue({ path: DEFAULT_DIR, exists: true });

    const phases: string[] = [];
    const { exportKitToDisk } = await import("../exportToDisk");
    await exportKitToDisk(TEST_KIT, new Map(), {
      onProgress: (p) => phases.push(p.phase),
    });

    expect(phases).toContain("done");
  });
});
