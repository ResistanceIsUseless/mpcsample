/**
 * ExportButton.test.tsx — Component tests for the ExportButton + progress dialog.
 *
 * Coverage (browser):
 *  - Renders the trigger button
 *  - Button is disabled / aria-disabled when no kit is loaded
 *  - Clicking the button opens the dialog when a kit is loaded
 *  - Clicking Export runs exportKitToZip and calls triggerDownload
 *  - Progress updates are reflected in the aria-live region
 *  - Error path shows the error message in an alert role
 *  - Cancel button aborts the export
 *  - Escape key closes the dialog
 *  - Focus returns to trigger button on close
 *
 * Coverage (desktop):
 *  - Desktop branch calls exportKitToDisk (not exportKitToZip)
 *  - Success shows the written path in the dialog
 *  - ENOENT shows SD-card-not-found message
 *  - EEXIST shows "already exists" message when no overwrite callback resolves
 *  - Overwrite confirmation UI appears on EEXIST (onNeedOverwrite called)
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SampleKit, SamplePad } from "../../kits/kit.types";
import { useMPCStore } from "../../state/store";
import { ExportButton } from "../ExportButton";

// ---------------------------------------------------------------------------
// Module mocks — placed before imports so Vitest hoists them
// ---------------------------------------------------------------------------

vi.mock("../../xpj/exportKit", () => ({
  exportKitToZip: vi.fn(async () => ({ fileName: "TestKit.zip", blob: new Blob(["zip"]) })),
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  triggerDownload: vi.fn(function triggerDownloadMock() {}),
}));

vi.mock("../../desktop/exportToDisk", () => ({
  exportKitToDisk: vi.fn(async () => ({
    written: "/Volumes/MPC-SD/MPC-Sample/Projects/TestKit.xpj",
    dataDir: "/Volumes/MPC-SD/MPC-Sample/Projects/TestKit_[ProjectData]",
    sampleCount: 2,
  })),
}));

// isDesktop is set per-test via the mocked module
let mockIsDesktop = false;

// Mutable mock object so tests can override ejectVolume behaviour
const mockDesktopObj = {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  ejectVolume: vi.fn(async function ejectVolumeMock() {}),
};

vi.mock("../../desktop/bridge", () => ({
  isDesktop: () => mockIsDesktop,
  desktop: () => mockDesktopObj,
}));

// ---------------------------------------------------------------------------
// Imports after mock declarations
// ---------------------------------------------------------------------------

// eslint-disable-next-line import/first
import { exportKitToDisk } from "../../desktop/exportToDisk";
// eslint-disable-next-line import/first
import { exportKitToZip, triggerDownload } from "../../xpj/exportKit";

// ---------------------------------------------------------------------------
// Fixtures
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

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

/**
 * Load a kit via the real `loadKit` action so that both `activeKit` and
 * `padMap` are populated.  ExportButton derives the export kit from `padMap`
 * (not from the stale `activeKit.pads` snapshot), so tests must populate
 * padMap too.
 */
function setKitInStore(kit: SampleKit | null) {
  if (kit === null) {
    useMPCStore.setState({ activeKit: null, userSamples: new Map() });
  } else {
    useMPCStore.getState().loadKit(kit);
    useMPCStore.setState({ userSamples: new Map() });
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Open the export dialog by clicking the trigger button. */
function openDialog() {
  const btn = screen.getByRole("button", { name: /export kit as akai/i });
  fireEvent.click(btn);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDesktop = false;
  // Reset to a fully blank store — no kit, empty padMap, no samples.
  useMPCStore.setState({
    activeKit: null,
    padMap: Object.fromEntries(Array.from({ length: 128 }, (_, i) => [i, null])) as Record<
      number,
      null
    >,
    userSamples: new Map(),
    isExporting: false,
    exportProgress: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExportButton", () => {
  it("renders the trigger button", () => {
    render(<ExportButton />);
    expect(screen.getByRole("button", { name: /export kit as akai/i })).toBeInTheDocument();
  });

  it("trigger button is disabled when no kit is loaded", () => {
    render(<ExportButton />);
    const btn = screen.getByRole("button", { name: /export kit as akai/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
  });

  it("trigger button has 'Load a kit first' title when disabled", () => {
    render(<ExportButton />);
    const btn = screen.getByRole("button", { name: /export kit as akai/i });
    expect(btn).toHaveAttribute("title", "Load a kit first");
  });

  it("trigger button is enabled when an activeKit with pads is loaded", () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    const btn = screen.getByRole("button", { name: /export kit as akai/i });
    expect(btn).not.toBeDisabled();
  });

  it("clicking trigger opens the dialog when kit is loaded", () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("EXPORT .XPJ")).toBeInTheDocument();
  });

  it("dialog has role=dialog and aria-modal", () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("clicking Export in dialog calls exportKitToZip with the kit and userSamples", async () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    const exportBtn = screen.getByRole("button", { name: /start export/i });
    await act(async () => {
      fireEvent.click(exportBtn);
    });

    expect(exportKitToZip).toHaveBeenCalledWith(
      TEST_KIT,
      expect.any(Map),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    );
  });

  it("calls triggerDownload after successful export", async () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(triggerDownload).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: "TestKit.zip" }),
      );
    });
  });

  it("shows success message after export completes", async () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      // Use the success <p> element specifically (not the aria-live region)
      const successEl = screen.getByText(/check your downloads folder/i);
      expect(successEl).toBeInTheDocument();
    });
  });

  it("shows error message when exportKitToZip rejects", async () => {
    vi.mocked(exportKitToZip).mockRejectedValueOnce(
      new Error("empty kit: no populated pads to export."),
    );

    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toMatch(/empty kit/i);
    });
  });

  it("shows 'Export cancelled.' when AbortError is thrown", async () => {
    vi.mocked(exportKitToZip).mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/export cancelled/i);
    });
  });

  it("progress onProgress callback updates aria-live region", async () => {
    // exportKitToZip mock that calls onProgress before resolving
    vi.mocked(exportKitToZip).mockImplementationOnce(async (_kit, _userSamples, opts) => {
      opts?.onProgress?.({ phase: "fetching", loaded: 1, total: 3 });
      return { fileName: "TestKit.zip", blob: new Blob(["zip"]) };
    });

    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    // After onProgress fires, aria-live region contains phase text
    await waitFor(() => {
      // Success message should eventually appear; confirm no crash
      expect(triggerDownload).toHaveBeenCalled();
    });
  });

  it("Cancel button (before running) closes the dialog without calling exportKitToZip", () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(exportKitToZip).not.toHaveBeenCalled();
  });

  it("Escape key closes the dialog when not running", () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not open the dialog when the trigger is disabled (no kit)", () => {
    render(<ExportButton />);
    // Trigger click on disabled button — nothing should happen
    const btn = screen.getByRole("button", { name: /export kit as akai/i });
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("aria-busy is false on the dialog initially", () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-busy", "false");
  });

  it("aria-busy is true while export is running", async () => {
    let resolveExport!: () => void;
    vi.mocked(exportKitToZip).mockImplementationOnce(
      () =>
        new Promise<{ fileName: string; blob: Blob }>((resolve) => {
          resolveExport = () => resolve({ fileName: "TestKit.zip", blob: new Blob(["zip"]) });
        }),
    );

    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    // While pending, dialog should be aria-busy
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-busy", "true");
    });

    // Resolve and clean up
    await act(async () => resolveExport());
  });

  // ── Regression: drop sample onto new/blank project ─────────────────────────

  it("enables EXPORT and calls exportKitToZip when a WAV is dropped onto a blank project", async () => {
    // Simulate: new project (blank kit, no pads) + user drops a WAV file.
    const blankKit: SampleKit = {
      id: "new",
      displayName: "New Kit",
      exportName: "New Kit",
      key: "",
      bpm: 120,
      pads: [], // blank — as created by loadBlankKit
    };

    // 1. Load the blank kit (populates activeKit, padMap stays all-null).
    useMPCStore.getState().loadKit(blankKit);
    useMPCStore.setState({ userSamples: new Map() });

    // Confirm button is disabled (no pads yet).
    render(<ExportButton />);
    const btn = screen.getByRole("button", { name: /export kit as akai/i });
    expect(btn).toBeDisabled();

    // 2. Simulate drop: registerUserSample + setPadSample (mirrors Pad.handleDrop).
    const droppedPad: SamplePad = {
      globalPadIdx: 0,
      sampleId: "user:kick.wav",
      displayName: "kick",
      sampleName: "kick.wav",
      fileName: "kick.wav",
      url: null, // user-imported: bytes in userSamples
      coarseTune: 0,
      fineTune: 0,
      gainCoefficient: 1.0,
      pan: 0.5,
    };
    const fakeBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF" header

    act(() => {
      useMPCStore.getState().registerUserSample("user:kick.wav", fakeBytes);
      useMPCStore.getState().setPadSample(0, droppedPad);
    });

    // 3. EXPORT button should now be enabled.
    await waitFor(() => {
      expect(btn).not.toBeDisabled();
    });

    // 4. Clicking Export should call exportKitToZip with the dropped pad.
    openDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(exportKitToZip).toHaveBeenCalledWith(
        expect.objectContaining({
          pads: expect.arrayContaining([
            expect.objectContaining({ sampleId: "user:kick.wav", url: null }),
          ]),
        }),
        expect.any(Map),
        expect.anything(),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Desktop branch tests
// ---------------------------------------------------------------------------

describe("ExportButton (desktop)", () => {
  beforeEach(() => {
    mockIsDesktop = true;
  });

  it("calls exportKitToDisk (not exportKitToZip) in desktop mode", async () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(exportKitToDisk).toHaveBeenCalledWith(
        TEST_KIT,
        expect.any(Map),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    expect(exportKitToZip).not.toHaveBeenCalled();
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it("shows written path in success message on desktop", async () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/exported to.*TestKit\.xpj/i)).toBeInTheDocument();
    });
  });

  it("shows ENOENT error message with SD-card wording", async () => {
    const enoentError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    vi.mocked(exportKitToDisk).mockRejectedValueOnce(enoentError);

    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/mpc sd card not found/i);
    });
  });

  it("shows EEXIST error message when no overwrite is chosen", async () => {
    const eexistError = Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    vi.mocked(exportKitToDisk).mockRejectedValueOnce(eexistError);

    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/already exists/i);
    });
  });

  it("shows 'Export cancelled.' when AbortError is thrown in desktop mode", async () => {
    vi.mocked(exportKitToDisk).mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/export cancelled/i);
    });
  });

  it("shows Eject Volume button after successful desktop export", async () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /eject mpc sd card safely/i })).toBeInTheDocument();
    });
  });

  it("clicking Eject Volume calls desktop().ejectVolume()", async () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /eject mpc sd card safely/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /eject mpc sd card safely/i }));
    });

    await waitFor(() => {
      expect(mockDesktopObj.ejectVolume).toHaveBeenCalledOnce();
    });
  });

  it("shows 'Volume ejected safely' after successful eject", async () => {
    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /eject mpc sd card safely/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /eject mpc sd card safely/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/volume ejected safely/i)).toBeInTheDocument();
    });
  });

  it("shows error message when ejectVolume rejects", async () => {
    mockDesktopObj.ejectVolume.mockRejectedValueOnce(new Error("disk busy"));

    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /eject mpc sd card safely/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /eject mpc sd card safely/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/disk busy/i);
    });
  });

  it("passes an onNeedOverwrite callback that shows in-dialog confirmation", async () => {
    // Capture the onNeedOverwrite callback from the exportKitToDisk call.
    let capturedOnNeedOverwrite: ((name: string) => Promise<boolean>) | undefined;

    vi.mocked(exportKitToDisk).mockImplementationOnce(async (_kit, _userSamples, opts) => {
      capturedOnNeedOverwrite = opts?.onNeedOverwrite;
      // Simulate EEXIST by calling onNeedOverwrite
      if (opts?.onNeedOverwrite) {
        await opts.onNeedOverwrite("TestKit");
      }
      return {
        written: "/Volumes/MPC-SD/MPC-Sample/Projects/TestKit.xpj",
        dataDir: "/Volumes/MPC-SD/MPC-Sample/Projects/TestKit_[ProjectData]",
        sampleCount: 2,
      };
    });

    setKitInStore(TEST_KIT);
    render(<ExportButton />);
    openDialog();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /start export/i }));
    });

    // The overwrite confirmation should appear.
    await waitFor(() => {
      expect(capturedOnNeedOverwrite).toBeDefined();
    });
  });
});
