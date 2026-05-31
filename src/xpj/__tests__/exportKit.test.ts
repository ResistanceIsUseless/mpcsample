/**
 * exportKit.test.ts — Unit tests for the export orchestration module.
 *
 * Coverage:
 *  - buildProjectArtifacts: returns correct shape (projectName, xpjBytes, sampleFiles)
 *  - buildProjectArtifacts: user-sample (url===null) bytes pulled from the map
 *  - buildProjectArtifacts: preset (url) bytes fetched via fetch mock
 *  - buildProjectArtifacts: throws "empty kit" when kit has no pads
 *  - buildProjectArtifacts: honors abort signal
 *  - exportKitToZip: builds a valid ZIP with correct entry paths
 *  - exportKitToZip: the .xpj entry gunzips to an ACVS header
 *  - exportKitToZip: user-imported pad (url===null) pulls bytes from userSamples
 *  - exportKitToZip: missing user sample bytes throws a descriptive error
 *  - exportKitToZip: empty kit throws "empty kit"
 *  - exportKitToZip: progress callback invoked with all phases
 *  - exportKitToZip: abort mid-fetch throws AbortError
 *  - exportKitToZip: de-duplicates shared fileName (single fetch for two pads)
 *  - triggerDownload: creates object URL, clicks a link, schedules revoke
 */

import { gunzipSync, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SampleKit, SamplePad } from "../../kits/kit.types";
import {
  buildProjectArtifacts,
  type ExportProgress,
  exportKitToZip,
  triggerDownload,
} from "../exportKit";

// ---------------------------------------------------------------------------
// jsdom doesn't implement Blob.prototype.arrayBuffer — polyfill it for tests
// ---------------------------------------------------------------------------
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePad(
  globalPadIdx: number,
  fileName: string,
  urlOrNull: string | null = `/kits/test/${fileName}`,
  overrides: Partial<SamplePad> = {},
): SamplePad {
  return {
    globalPadIdx,
    sampleId: `sid-${globalPadIdx}`,
    displayName: `Pad ${globalPadIdx}`,
    sampleName: fileName.replace(/\.wav$/, ""),
    fileName,
    url: urlOrNull,
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

/** Build a minimal WAV-like Uint8Array for testing. */
function fakeWavBytes(label: string): Uint8Array {
  return new TextEncoder().encode(`RIFF....WAVEfmt ${label}`);
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

/**
 * Install a global fetch mock that returns `bytes` for every request.
 * Returns a spy so tests can assert call counts.
 */
function mockFetch(bytesMap: Record<string, Uint8Array>): ReturnType<typeof vi.fn> {
  const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const bytes = bytesMap[url];

    // Check abort signal
    if (init?.signal?.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }

    if (!bytes) {
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
        arrayBuffer: () => Promise.reject(new Error("Not Found")),
      } as Response);
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
    } as Response);
  });

  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Core export tests
// ---------------------------------------------------------------------------

describe("exportKitToZip", () => {
  it("produces a ZIP containing the .xpj and sample entries at correct paths", async () => {
    const kickBytes = fakeWavBytes("kick");
    const snareBytes = fakeWavBytes("snare");

    const pad0 = makePad(0, "kick.wav");
    const pad1 = makePad(1, "snare.wav");
    const kit = makeKit([pad0, pad1]);

    mockFetch({
      "/kits/test/kick.wav": kickBytes,
      "/kits/test/snare.wav": snareBytes,
    });

    const result = await exportKitToZip(kit, new Map());

    expect(result.fileName).toBe("TestKit.zip");
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("application/zip");

    // Unzip and inspect entries
    const zipBytes = new Uint8Array(await result.blob.arrayBuffer());
    const entries = unzipSync(zipBytes);
    const keys = Object.keys(entries);

    expect(keys).toContain("TestKit.xpj");
    expect(keys).toContain("TestKit_[ProjectData]/kick.wav");
    expect(keys).toContain("TestKit_[ProjectData]/snare.wav");
  });

  it("the .xpj entry gunzips to a payload starting with ACVS", async () => {
    const kickBytes = fakeWavBytes("kick");
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);

    mockFetch({ "/kits/test/kick.wav": kickBytes });

    const result = await exportKitToZip(kit, new Map());

    const zipBytes = new Uint8Array(await result.blob.arrayBuffer());
    const entries = unzipSync(zipBytes);

    const xpjEntry = entries["TestKit.xpj"];
    expect(xpjEntry).toBeDefined();

    // The .xpj is itself gzip-compressed; gunzip it and check header
    const decompressed = gunzipSync(xpjEntry);
    const text = new TextDecoder().decode(decompressed);
    expect(text.startsWith("ACVS\n")).toBe(true);
  });

  it("user-imported pad (url===null) reads bytes from userSamples by sampleId", async () => {
    const importedBytes = fakeWavBytes("imported");
    const sampleId = "user-imported-001";
    const pad = makePad(0, "my import.wav", null, { sampleId });
    const kit = makeKit([pad]);

    const userSamples = new Map([[sampleId, importedBytes]]);

    // No fetch mock needed — no URL to fetch
    mockFetch({});

    const result = await exportKitToZip(kit, userSamples);
    const zipBytes = new Uint8Array(await result.blob.arrayBuffer());
    const entries = unzipSync(zipBytes);

    // Exact file path preserved (spaces)
    expect(Object.keys(entries)).toContain("TestKit_[ProjectData]/my import.wav");
  });

  it("throws a descriptive error when user sample bytes are missing", async () => {
    const pad = makePad(0, "missing.wav", null, { sampleId: "ghost" });
    const kit = makeKit([pad]);

    mockFetch({});

    await expect(exportKitToZip(kit, new Map())).rejects.toThrow(/missing\.wav/i);
  });

  it("throws 'empty kit' error when kit has no pads", async () => {
    const kit = makeKit([]);
    mockFetch({});

    await expect(exportKitToZip(kit, new Map())).rejects.toThrow(/empty kit/i);
  });

  it("invokes onProgress callback with phases: fetching, building, zipping, done", async () => {
    const kickBytes = fakeWavBytes("kick");
    const pad0 = makePad(0, "kick.wav");
    const kit = makeKit([pad0]);

    mockFetch({ "/kits/test/kick.wav": kickBytes });

    const phases: ExportProgress["phase"][] = [];
    await exportKitToZip(kit, new Map(), {
      onProgress: (p) => {
        if (!phases.includes(p.phase)) phases.push(p.phase);
      },
    });

    expect(phases).toContain("fetching");
    expect(phases).toContain("building");
    expect(phases).toContain("zipping");
    expect(phases).toContain("done");
  });

  it("reports loaded/total counts incrementally during fetching phase", async () => {
    const kickBytes = fakeWavBytes("kick");
    const snareBytes = fakeWavBytes("snare");
    const pad0 = makePad(0, "kick.wav");
    const pad1 = makePad(1, "snare.wav");
    const kit = makeKit([pad0, pad1]);

    mockFetch({
      "/kits/test/kick.wav": kickBytes,
      "/kits/test/snare.wav": snareBytes,
    });

    const fetchingUpdates: Array<{ loaded: number; total: number }> = [];
    await exportKitToZip(kit, new Map(), {
      onProgress: (p) => {
        if (p.phase === "fetching") {
          fetchingUpdates.push({ loaded: p.loaded, total: p.total });
        }
      },
    });

    // At least an initial 0/2 and a final 2/2
    expect(fetchingUpdates.some((u) => u.total === 2)).toBe(true);
    const last = fetchingUpdates[fetchingUpdates.length - 1];
    expect(last.loaded).toBe(2);
  });

  it("aborts mid-fetch when signal is aborted (throws AbortError)", async () => {
    const controller = new AbortController();

    // Simulate a fetch that checks abort signal
    const fetchSpy = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      // Simulate slow fetch — abort before it resolves
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const pad0 = makePad(0, "slow.wav");
    const kit = makeKit([pad0]);

    // Abort after a tick
    setTimeout(() => controller.abort(), 0);

    await expect(exportKitToZip(kit, new Map(), { signal: controller.signal })).rejects.toThrow(
      /abort/i,
    );
  });

  it("de-duplicates a shared fileName: fetches only once for two pads with same file", async () => {
    const sharedBytes = fakeWavBytes("shared");

    const pad0 = makePad(0, "shared.wav", "/kits/test/shared.wav", {
      sampleId: "id-0",
      sampleName: "shared-a",
    });
    const pad1 = makePad(1, "shared.wav", "/kits/test/shared.wav", {
      sampleId: "id-1",
      sampleName: "shared-b",
    });
    const kit = makeKit([pad0, pad1]);

    const fetchSpy = mockFetch({ "/kits/test/shared.wav": sharedBytes });

    const result = await exportKitToZip(kit, new Map());

    // Fetch called exactly once for the de-duped file
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // ZIP contains the shared file once
    const zipBytes = new Uint8Array(await result.blob.arrayBuffer());
    const entries = unzipSync(zipBytes);
    const sampleKeys = Object.keys(entries).filter((k) => k.endsWith(".wav"));
    expect(sampleKeys).toHaveLength(1);
    expect(sampleKeys[0]).toBe("TestKit_[ProjectData]/shared.wav");
  });

  it("preserves special characters in fileName (spaces and parentheses)", async () => {
    const bytes = fakeWavBytes("special");
    const fileName = "808Kick (1).wav";
    const pad = makePad(0, fileName, `/kits/test/${fileName}`);
    const kit = makeKit([pad]);

    mockFetch({ [`/kits/test/${fileName}`]: bytes });

    const result = await exportKitToZip(kit, new Map());
    const zipBytes = new Uint8Array(await result.blob.arrayBuffer());
    const entries = unzipSync(zipBytes);

    expect(Object.keys(entries)).toContain(`TestKit_[ProjectData]/${fileName}`);
  });

  it("ZIP project-data folder uses _[ProjectData] suffix with brackets", async () => {
    const bytes = fakeWavBytes("x");
    const pad = makePad(0, "x.wav");
    const kit = makeKit([pad], { exportName: "London Full" });

    mockFetch({ "/kits/test/x.wav": bytes });

    const result = await exportKitToZip(kit, new Map());
    const zipBytes = new Uint8Array(await result.blob.arrayBuffer());
    const entries = unzipSync(zipBytes);

    expect(Object.keys(entries)).toContain("London Full_[ProjectData]/x.wav");
  });
});

// ---------------------------------------------------------------------------
// triggerDownload
// ---------------------------------------------------------------------------

describe("triggerDownload", () => {
  it("creates an object URL, appends a link with download attr, clicks it, removes it", () => {
    const fakeUrl = "blob:http://localhost/fake-uuid";
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue(fakeUrl);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(function revokeNoop() {});
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function clickNoop() {});

    const blob = new Blob(["test"], { type: "application/zip" });
    triggerDownload({ fileName: "London Full.zip", blob });

    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledOnce();

    // Anchor should have been removed from the DOM immediately
    const remainingLinks = document.querySelectorAll("a[download]");
    expect(remainingLinks).toHaveLength(0);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("sets the download attribute to the result fileName", () => {
    const fakeUrl = "blob:http://localhost/fake-uuid-2";
    vi.spyOn(URL, "createObjectURL").mockReturnValue(fakeUrl);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(function revokeNoop2() {});

    let capturedDownload = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      capturedDownload = this.download;
    });

    const blob = new Blob(["test"]);
    triggerDownload({ fileName: "My Kit.zip", blob });

    expect(capturedDownload).toBe("My Kit.zip");

    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// buildProjectArtifacts
// ---------------------------------------------------------------------------

describe("buildProjectArtifacts", () => {
  it("returns projectName, xpjBytes, and sampleFiles for a kit with preset URLs", async () => {
    const kickBytes = fakeWavBytes("kick");
    const pad = makePad(0, "kick.wav");
    const kit = makeKit([pad]);

    mockFetch({ "/kits/test/kick.wav": kickBytes });

    const artifacts = await buildProjectArtifacts(kit, new Map());

    expect(artifacts).toHaveProperty("projectName", "TestKit");
    expect(artifacts.xpjBytes).toBeInstanceOf(Uint8Array);
    expect(artifacts.xpjBytes.length).toBeGreaterThan(0);
    expect(artifacts.sampleFiles).toHaveLength(1);
    expect(artifacts.sampleFiles[0].path).toBe("kick.wav");
    expect(artifacts.sampleFiles[0].bytes).toBeInstanceOf(Uint8Array);
  });

  it("reads user-sample bytes from the userSamples map when url is null", async () => {
    const importedBytes = fakeWavBytes("imported");
    const sampleId = "user-imported-001";
    const pad = makePad(0, "imported.wav", null, { sampleId });
    const kit = makeKit([pad]);

    const userSamples = new Map([[sampleId, importedBytes]]);
    mockFetch({});

    const artifacts = await buildProjectArtifacts(kit, userSamples);

    // Fetch should NOT have been called (no URL to fetch).
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(artifacts.sampleFiles).toHaveLength(1);
    expect(artifacts.sampleFiles[0].path).toBe("imported.wav");
  });

  it("fetches preset sample bytes via fetch when url is set", async () => {
    const snareBytes = fakeWavBytes("snare");
    const pad = makePad(0, "snare.wav", "/kits/test/snare.wav");
    const kit = makeKit([pad]);

    const fetchSpy = mockFetch({ "/kits/test/snare.wav": snareBytes });

    await buildProjectArtifacts(kit, new Map());

    expect(fetchSpy).toHaveBeenCalledWith("/kits/test/snare.wav", expect.anything());
  });

  it("throws 'empty kit' when the kit has no pads", async () => {
    const kit = makeKit([]);
    mockFetch({});

    await expect(buildProjectArtifacts(kit, new Map())).rejects.toThrow(/empty kit/i);
  });

  it("throws AbortError when the signal is aborted before fetch", async () => {
    const controller = new AbortController();
    controller.abort();

    const pad = makePad(0, "kick.wav");
    const kit = makeKit([pad]);

    const fetchSpy = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      buildProjectArtifacts(kit, new Map(), { signal: controller.signal }),
    ).rejects.toThrow(/abort/i);
  });

  it("throws a descriptive error when user-imported bytes are missing from userSamples", async () => {
    const pad = makePad(0, "ghost.wav", null, { sampleId: "ghost-id" });
    const kit = makeKit([pad]);
    mockFetch({});

    await expect(buildProjectArtifacts(kit, new Map())).rejects.toThrow(/ghost\.wav/i);
  });

  it("reports fetching and building phases via onProgress", async () => {
    const bytes = fakeWavBytes("hi");
    const pad = makePad(0, "hi.wav");
    const kit = makeKit([pad]);
    mockFetch({ "/kits/test/hi.wav": bytes });

    const phases: ExportProgress["phase"][] = [];
    await buildProjectArtifacts(kit, new Map(), {
      onProgress: (p) => {
        if (!phases.includes(p.phase)) phases.push(p.phase);
      },
    });

    expect(phases).toContain("fetching");
    expect(phases).toContain("building");
    // "zipping" and "done" are emitted by exportKitToZip, not buildProjectArtifacts.
    expect(phases).not.toContain("zipping");
    expect(phases).not.toContain("done");
  });
});
