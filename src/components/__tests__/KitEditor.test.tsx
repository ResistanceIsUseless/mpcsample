import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetImportCounter } from "../../kits/importWav";
import type { GlobalPadIdx, SampleKit, SamplePad } from "../../kits/kit.types";
import { useMPCStore } from "../../state/store";
import { KitEditor } from "../KitEditor";

// ── Mock importWav for drop tests ─────────────────────────────────────────────
// jsdom does not implement File.prototype.arrayBuffer, so we mock importWavFile
// to avoid calling file.arrayBuffer() in tests.
vi.mock("../../kits/importWav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../kits/importWav")>();
  return {
    ...actual,
    importWavFile: vi.fn(async (file: File) => {
      const fileName = actual.sanitizeFileName(file.name);
      const sampleName = fileName.replace(/\.wav$/i, "");
      const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      return {
        sampleId: `user:${fileName}`,
        fileName,
        sampleName,
        bytes,
      };
    }),
  };
});

// Import the (mocked) importWavFile so we can control it per test.
// eslint-disable-next-line import/first
import { importWavFile as mockedImportWavFile } from "../../kits/importWav";

vi.mock("../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const samplePad: SamplePad = {
  globalPadIdx: 0 as GlobalPadIdx,
  sampleId: "kick-01",
  displayName: "808 Kick",
  sampleName: "808Kick.wav",
  fileName: "808Kick.wav",
  url: "/kits/london-full/808Kick.wav",
  coarseTune: 0,
  fineTune: 0,
  gainCoefficient: 1.0,
  pan: 0.5,
};

const sampleKit: SampleKit = {
  id: "london-full",
  displayName: "London Full",
  exportName: "London Full",
  key: "C Minor",
  bpm: 114,
  pads: [samplePad],
};

function buildPadMap(): Record<number, SamplePad | null> {
  const map: Record<number, SamplePad | null> = {};
  for (let i = 0; i < 128; i++) map[i] = null;
  map[0] = samplePad;
  return map;
}

// ── Store reset ───────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetImportCounter();
  useMPCStore.setState({
    activeKitId: "london-full",
    activeKit: sampleKit,
    padMap: buildPadMap(),
    bankIdx: 0,
    maxBank: 3,
  });
});

function openEditor() {
  act(() => {
    window.dispatchEvent(new CustomEvent("mpc:open-editor"));
  });
}

// ── Helper: build a minimal WAV file ─────────────────────────────────────────

function makeWavFile(name = "test.wav"): File {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
    0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
  ]);
  return new File([bytes], name, { type: "audio/wav" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("KitEditor", () => {
  // ── Open/close ──────────────────────────────────────────────────────────

  it("renders closed by default (no 'open' class)", () => {
    render(<KitEditor />);
    const panel = document.querySelector(".kit-editor");
    expect(panel).toBeTruthy();
    expect(panel?.className).not.toContain("open");
  });

  it("mpc:open-editor event opens the panel", () => {
    render(<KitEditor />);
    openEditor();
    const panel = document.querySelector(".kit-editor");
    expect(panel?.className).toContain("open");
  });

  it("has role=dialog", () => {
    render(<KitEditor />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("has aria-modal=true", () => {
    render(<KitEditor />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("heading says EDIT KIT", () => {
    render(<KitEditor />);
    openEditor();
    expect(screen.getByText("EDIT KIT")).toBeInTheDocument();
  });

  it("Escape key closes the panel", () => {
    render(<KitEditor />);
    openEditor();
    const panel = document.querySelector(".kit-editor") as HTMLElement;
    expect(panel.className).toContain("open");
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(panel.className).not.toContain("open");
  });

  it("close button closes the panel", () => {
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /close kit editor/i }));
    expect(document.querySelector(".kit-editor")?.className).not.toContain("open");
  });

  // ── Focus trap ──────────────────────────────────────────────────────────

  it("focus trap: Tab from last focusable wraps to first", () => {
    render(<KitEditor />);
    openEditor();
    const panel = document.querySelector(".kit-editor") as HTMLElement;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"),
    );
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(panel, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(focusable[0]);
  });

  // ── Kit name ──────────────────────────────────────────────────────────

  it("kit name input shows activeKit.displayName", () => {
    render(<KitEditor />);
    openEditor();
    const input = screen.getByRole("textbox", { name: /kit name/i });
    expect((input as HTMLInputElement).value).toBe("London Full");
  });

  it("changing kit name calls store.setKitName", () => {
    const setKitName = vi.fn();
    useMPCStore.setState({ setKitName });
    render(<KitEditor />);
    openEditor();
    const input = screen.getByRole("textbox", { name: /kit name/i });
    fireEvent.change(input, { target: { value: "My Kit" } });
    expect(setKitName).toHaveBeenCalledWith("My Kit");
  });

  // ── Pad grid ─────────────────────────────────────────────────────────

  it("renders 16 pad cells for the active bank", () => {
    render(<KitEditor />);
    openEditor();
    const cells = document.querySelectorAll(".ke-pad-cell");
    expect(cells).toHaveLength(16);
  });

  it("pad cell for pad 1 shows '808 Kick' display name", () => {
    render(<KitEditor />);
    openEditor();
    // Pad 1 (localIdx 0, bank A = globalIdx 0) has samplePad.displayName = "808 Kick"
    expect(screen.getAllByText("808 Kick").length).toBeGreaterThan(0);
  });

  it("clicking a pad cell selects it (adds 'selected' class)", () => {
    render(<KitEditor />);
    openEditor();
    const pad1Btn = screen.getByRole("button", { name: /Pad 1, 808 Kick/i });
    fireEvent.click(pad1Btn);
    expect(pad1Btn.className).toContain("selected");
  });

  it("clicking the same pad again deselects it", () => {
    render(<KitEditor />);
    openEditor();
    const pad1Btn = screen.getByRole("button", { name: /Pad 1, 808 Kick/i });
    fireEvent.click(pad1Btn);
    fireEvent.click(pad1Btn);
    expect(pad1Btn.className).not.toContain("selected");
  });

  // ── Bank selector ─────────────────────────────────────────────────────

  it("shows banks A–D at minimum", () => {
    render(<KitEditor />);
    openEditor();
    expect(screen.getByRole("button", { name: /Bank A/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bank D/i })).toBeInTheDocument();
  });

  it("clicking bank B calls store.setBank(1)", () => {
    const setBank = vi.fn();
    useMPCStore.setState({ setBank });
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Bank B/i }));
    expect(setBank).toHaveBeenCalledWith(1);
  });

  // ── Inline pad editor: tune/gain/name ─────────────────────────────────

  it("selecting a pad shows coarse tune slider", () => {
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Pad 1, 808 Kick/i }));
    expect(screen.getByRole("slider", { name: /coarse tune/i })).toBeInTheDocument();
  });

  it("coarse tune slider calls store.setPadTune", () => {
    const setPadTune = vi.fn();
    useMPCStore.setState({ setPadTune });
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Pad 1, 808 Kick/i }));
    const slider = screen.getByRole("slider", { name: /coarse tune/i });
    fireEvent.change(slider, { target: { value: "5" } });
    expect(setPadTune).toHaveBeenCalledWith(0, 5, 0);
  });

  it("fine tune slider calls store.setPadTune", () => {
    const setPadTune = vi.fn();
    useMPCStore.setState({ setPadTune });
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Pad 1, 808 Kick/i }));
    const slider = screen.getByRole("slider", { name: /fine tune/i });
    fireEvent.change(slider, { target: { value: "50" } });
    expect(setPadTune).toHaveBeenCalledWith(0, 0, 50);
  });

  it("volume slider calls store.setPadGain", () => {
    const setPadGain = vi.fn();
    useMPCStore.setState({ setPadGain });
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Pad 1, 808 Kick/i }));
    const slider = screen.getByRole("slider", { name: /pad volume/i });
    fireEvent.change(slider, { target: { value: "150" } }); // 150/100 = 1.5
    expect(setPadGain).toHaveBeenCalledWith(0, 1.5);
  });

  it("pad name input calls store.setPadName", () => {
    const setPadName = vi.fn();
    useMPCStore.setState({ setPadName });
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Pad 1, 808 Kick/i }));
    const nameInput = screen.getByRole("textbox", {
      name: /pad display name/i,
    });
    fireEvent.change(nameInput, { target: { value: "My Kick" } });
    expect(setPadName).toHaveBeenCalledWith(0, "My Kick");
  });

  // ── Move / Swap ───────────────────────────────────────────────────────

  it("Move button is disabled when target is empty", () => {
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Pad 1, 808 Kick/i }));
    const moveBtn = screen.getByRole("button", { name: /Move pad 1 to/i });
    expect(moveBtn).toBeDisabled();
  });

  it("Move button calls movePadSample when valid target entered", () => {
    const movePadSample = vi.fn();
    useMPCStore.setState({ movePadSample });
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Pad 1, 808 Kick/i }));
    const moveInput = screen.getByRole("spinbutton", {
      name: /target pad for move/i,
    });
    fireEvent.change(moveInput, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Move pad 1 to pad 5/i }));
    expect(movePadSample).toHaveBeenCalledWith(0, 4); // 1-based 5 → 0-based 4
  });

  it("Swap button calls swapPad when valid target entered", () => {
    const swapPad = vi.fn();
    useMPCStore.setState({ swapPad });
    render(<KitEditor />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Pad 1, 808 Kick/i }));
    const swapInput = screen.getByRole("spinbutton", {
      name: /target pad for swap/i,
    });
    fireEvent.change(swapInput, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: /Swap pad 1 with pad 8/i }));
    expect(swapPad).toHaveBeenCalledWith(0, 7); // 1-based 8 → 0-based 7
  });

  // ── WAV drag-drop ─────────────────────────────────────────────────────
  // jsdom does not set dataTransfer.files via fireEvent; we inject the file
  // by creating a DragEvent whose dataTransfer is patched before dispatch.

  function dispatchDropWithFile(element: Element, file: File): void {
    const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    // Patch dataTransfer with a FileList-like object.
    Object.defineProperty(event, "dataTransfer", {
      value: { files: [file], items: [], dropEffect: "copy" },
      writable: false,
    });
    element.dispatchEvent(event);
  }

  it("dropping a valid wav calls registerUserSample and setPadSample", async () => {
    const registerUserSample = vi.fn();
    const setPadSample = vi.fn();
    useMPCStore.setState({ registerUserSample, setPadSample });

    render(<KitEditor />);
    openEditor();

    const pad1Btn = screen.getByRole("button", { name: /Pad 1, 808 Kick/i });
    const file = makeWavFile("snare.wav");

    await act(async () => {
      dispatchDropWithFile(pad1Btn, file);
    });

    await waitFor(() => {
      expect(registerUserSample).toHaveBeenCalledOnce();
      expect(setPadSample).toHaveBeenCalledOnce();
    });

    const [sampleId, bytes] = (registerUserSample as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      Uint8Array,
    ];
    expect(sampleId.startsWith("user:")).toBe(true);
    expect(bytes).toBeInstanceOf(Uint8Array);

    const [padIdx, pad] = (setPadSample as ReturnType<typeof vi.fn>).mock.calls[0] as [
      number,
      SamplePad,
    ];
    expect(padIdx).toBe(0);
    expect(pad.url).toBeNull();
    expect(pad.fileName).toBe("snare.wav");
  });

  it("dropping a non-wav shows an accessible error", async () => {
    // Force the mock to reject (simulating a non-wav file rejection).
    vi.mocked(mockedImportWavFile).mockRejectedValueOnce(
      new Error('Only .wav files are supported. "audio.mp3" does not have a .wav extension.'),
    );

    render(<KitEditor />);
    openEditor();

    const pad1Btn = screen.getByRole("button", { name: /Pad 1, 808 Kick/i });
    const badFile = new File([new Uint8Array(4)], "audio.mp3", {
      type: "audio/mpeg",
    });

    await act(async () => {
      dispatchDropWithFile(pad1Btn, badFile);
    });

    await waitFor(() => {
      const err = screen.getByTestId("ke-drop-error");
      expect(err).toBeInTheDocument();
      expect(err.textContent).toMatch(/\.wav/i);
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────

  it("error element has role=alert for screen readers", async () => {
    vi.mocked(mockedImportWavFile).mockRejectedValueOnce(
      new Error("Only .wav files are supported."),
    );

    render(<KitEditor />);
    openEditor();

    const pad1Btn = screen.getByRole("button", { name: /Pad 1, 808 Kick/i });
    const badFile = new File([new Uint8Array(4)], "bad.ogg", {
      type: "audio/ogg",
    });

    await act(async () => {
      dispatchDropWithFile(pad1Btn, badFile);
    });

    await waitFor(() => {
      const err = document.querySelector("[data-testid='ke-drop-error']");
      expect(err?.getAttribute("role")).toBe("alert");
    });
  });

});
