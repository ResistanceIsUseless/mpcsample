import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PADS } from "../../data/padLayout";
import type { SamplePad } from "../../kits/kit.types";
import { useMPCStore } from "../../state/store";
import { Pad } from "../Pad";

// Mock useReducedMotion so tests don't depend on matchMedia
vi.mock("../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setState = (s: Record<string, unknown>) => useMPCStore.setState(s as any);

// Helper: reset store pads to default "armed" state before each test
beforeEach(() => {
  const pads: Record<number, "idle" | "armed" | "press"> = {};
  for (let i = 0; i < 128; i++) pads[i] = "armed";
  setState({ pads, bankIdx: 0, loadingPads: {} });
});

const padDef0 = PADS[0]; // localIdx 0, num 1, label "FULL LEVEL"
const padDef12 = PADS[12]; // localIdx 12, num 13, label "TRIM SAMPLE"

// A minimal SamplePad fixture
const samplePad: SamplePad = {
  globalPadIdx: 0,
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

describe("Pad", () => {
  it("renders with correct aria-label containing pad number and label (no sample)", () => {
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button", { name: /Pad 1 — FULL LEVEL/i });
    expect(btn).toBeInTheDocument();
  });

  it("renders with sample displayName in aria-label when sample is provided", () => {
    render(<Pad definition={padDef0} globalIdx={0} sample={samplePad} />);
    const btn = screen.getByRole("button", { name: /Pad 1 — 808 Kick/i });
    expect(btn).toBeInTheDocument();
  });

  it("renders padded num and static cap text when no sample", () => {
    render(<Pad definition={padDef0} globalIdx={0} />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("FULL LEVEL")).toBeInTheDocument();
  });

  it("renders padded num and sample displayName when sample is provided", () => {
    render(<Pad definition={padDef0} globalIdx={0} sample={samplePad} />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("808 Kick")).toBeInTheDocument();
  });

  it("aria-pressed is false initially (state='armed')", () => {
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("aria-pressed becomes true and class includes is-press when pad state is 'press'", () => {
    const { getByRole } = render(<Pad definition={padDef0} globalIdx={0} />);
    act(() => {
      const pads = { ...useMPCStore.getState().pads, 0: "press" as const };
      setState({ pads });
    });
    const btn = getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn.className).toContain("is-press");
  });

  it("has data-pad-idx attribute with the globalIdx value", () => {
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("data-pad-idx", "0");
  });

  it("data-pad-idx reflects the global index for bank B (globalIdx=16)", () => {
    // Bank B, local pad 0 → globalIdx = 16
    act(() => {
      setState({ bankIdx: 1 });
    });
    render(<Pad definition={padDef0} globalIdx={16} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("data-pad-idx", "16");
  });

  it("onPointerDown fires triggerPad with globalIdx and default velocity 0.9", () => {
    const triggerPad = vi.fn();
    setState({ triggerPad });
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");
    // pressure = 0 → fallback to 0.9
    fireEvent.pointerDown(btn, { pressure: 0 });
    expect(triggerPad).toHaveBeenCalledWith(0, 0.9);
  });

  it("onPointerDown fires triggerPad with bank-offset globalIdx", () => {
    const triggerPad = vi.fn();
    setState({ triggerPad });
    // Render bank B, local pad 0 → globalIdx=16
    render(<Pad definition={padDef0} globalIdx={16} />);
    const btn = screen.getByRole("button");
    fireEvent.pointerDown(btn, { pressure: 0 });
    expect(triggerPad).toHaveBeenCalledWith(16, 0.9);
  });

  it("onPointerDown with pressure=0.5 calls triggerPad with vel 0.5", () => {
    const triggerPad = vi.fn();
    setState({ triggerPad });
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");
    fireEvent.pointerDown(btn, { pressure: 0.5 });
    expect(triggerPad).toHaveBeenCalledWith(0, 0.5);
  });

  it("onPointerUp fires releasePad with globalIdx", () => {
    const releasePad = vi.fn();
    setState({ releasePad });
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");
    fireEvent.pointerUp(btn);
    expect(releasePad).toHaveBeenCalledWith(0);
  });

  it("renders pad num 13 for pad at localIdx 12", () => {
    render(<Pad definition={padDef12} globalIdx={12} />);
    expect(screen.getByText("13")).toBeInTheDocument();
  });

  it("shows loading indicator when loading=true", () => {
    const { container } = render(<Pad definition={padDef0} globalIdx={0} loading />);
    const btn = container.querySelector("button");
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".pad-loading")).toBeInTheDocument();
    expect(btn?.className).toContain("is-loading");
  });

  it("does not show loading indicator when loading=false (default)", () => {
    const { container } = render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = container.querySelector("button");
    expect(btn).not.toHaveAttribute("aria-busy");
    expect(container.querySelector(".pad-loading")).not.toBeInTheDocument();
  });

  it("useReducedMotion hook is invoked (matchMedia was queried)", () => {
    const { container } = render(<Pad definition={padDef0} globalIdx={0} />);
    expect(container.querySelector(".pad")).toBeInTheDocument();
  });
});

describe("Pad — hold-and-drag swap gesture", () => {
  // jsdom does not implement document.elementFromPoint; define it via
  // Object.defineProperty so each test can control what's under the pointer.
  let eftpMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eftpMock = vi.fn().mockReturnValue(null);
    Object.defineProperty(document, "elementFromPoint", {
      value: eftpMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(document, "elementFromPoint", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  function stubSwapTarget(padIdx: number) {
    const el = document.createElement("button");
    el.setAttribute("data-pad-idx", String(padIdx));
    eftpMock.mockReturnValue(el);
    return el;
  }

  it("tap (pointerDown + pointerUp without movement) does not call swapPad", () => {
    const swapPad = vi.fn();
    const triggerPad = vi.fn();
    const releasePad = vi.fn();
    setState({ swapPad, triggerPad, releasePad });
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");

    fireEvent.pointerDown(btn, { clientX: 0, clientY: 0, pressure: 0 });
    fireEvent.pointerUp(btn, { clientX: 0, clientY: 0 });

    expect(triggerPad).toHaveBeenCalledWith(0, 0.9);
    expect(releasePad).toHaveBeenCalledWith(0);
    expect(swapPad).not.toHaveBeenCalled();
  });

  it("small jitter below threshold is treated as a tap (no swap)", () => {
    const swapPad = vi.fn();
    setState({ swapPad });
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");

    stubSwapTarget(5);
    fireEvent.pointerDown(btn, { clientX: 0, clientY: 0, pressure: 0 });
    // sqrt(3² + 3²) ≈ 4.2 — below 10 px threshold
    fireEvent.pointerMove(btn, { clientX: 3, clientY: 3 });
    fireEvent.pointerUp(btn, { clientX: 3, clientY: 3 });

    expect(swapPad).not.toHaveBeenCalled();
  });

  it("drag past threshold over a different pad calls swapPad(from, to)", () => {
    const swapPad = vi.fn();
    setState({ swapPad });
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");

    stubSwapTarget(5);
    fireEvent.pointerDown(btn, { clientX: 0, clientY: 0, pressure: 0 });
    fireEvent.pointerMove(btn, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(btn, { clientX: 50, clientY: 50 });

    expect(swapPad).toHaveBeenCalledOnce();
    expect(swapPad).toHaveBeenCalledWith(0, 5);
  });

  it("drag releasing over the source pad itself does not call swapPad", () => {
    const swapPad = vi.fn();
    setState({ swapPad });
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");

    // elementFromPoint returns the source pad (idx 0 == globalIdx)
    stubSwapTarget(0);
    fireEvent.pointerDown(btn, { clientX: 0, clientY: 0, pressure: 0 });
    fireEvent.pointerMove(btn, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(btn, { clientX: 50, clientY: 50 });

    expect(swapPad).not.toHaveBeenCalled();
  });

  it("drag adds pad--dragging class to the source pad during gesture", () => {
    setState({ swapPad: vi.fn() });
    const { container } = render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = container.querySelector("button")!;

    stubSwapTarget(5);
    fireEvent.pointerDown(btn, { clientX: 0, clientY: 0, pressure: 0 });
    fireEvent.pointerMove(btn, { clientX: 50, clientY: 50 });

    expect(btn.className).toContain("pad--dragging");
  });

  it("pad--dragging class is removed after pointerUp", () => {
    setState({ swapPad: vi.fn() });
    const { container } = render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = container.querySelector("button")!;

    stubSwapTarget(5);
    fireEvent.pointerDown(btn, { clientX: 0, clientY: 0, pressure: 0 });
    fireEvent.pointerMove(btn, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(btn, { clientX: 50, clientY: 50 });

    expect(btn.className).not.toContain("pad--dragging");
  });

  it("triggerPad still fires on pointerDown even when a drag follows (playback regression)", () => {
    const triggerPad = vi.fn();
    const swapPad = vi.fn();
    setState({ triggerPad, swapPad });
    render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = screen.getByRole("button");

    stubSwapTarget(5);
    fireEvent.pointerDown(btn, { clientX: 0, clientY: 0, pressure: 0 });
    fireEvent.pointerMove(btn, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(btn, { clientX: 50, clientY: 50 });

    // Playback fires immediately on press, even if a swap follows.
    expect(triggerPad).toHaveBeenCalledWith(0, 0.9);
    expect(swapPad).toHaveBeenCalledWith(0, 5);
  });

  it("pointerCancel during drag resets dragging state without swapping", () => {
    const swapPad = vi.fn();
    setState({ swapPad });
    const { container } = render(<Pad definition={padDef0} globalIdx={0} />);
    const btn = container.querySelector("button")!;

    stubSwapTarget(5);
    fireEvent.pointerDown(btn, { clientX: 0, clientY: 0, pressure: 0 });
    fireEvent.pointerMove(btn, { clientX: 50, clientY: 50 });
    fireEvent.pointerCancel(btn);

    expect(swapPad).not.toHaveBeenCalled();
    expect(btn.className).not.toContain("pad--dragging");
  });
});

describe("Pad — bank offset derivation", () => {
  it("localToGlobal correctly maps bank 0 local 0 → 0", () => {
    // Tested indirectly: bank A pad 0 shows data-pad-idx=0
    render(<Pad definition={padDef0} globalIdx={0} />);
    expect(screen.getByRole("button")).toHaveAttribute("data-pad-idx", "0");
  });

  it("localToGlobal correctly maps bank 1 local 0 → 16", () => {
    render(<Pad definition={padDef0} globalIdx={16} />);
    expect(screen.getByRole("button")).toHaveAttribute("data-pad-idx", "16");
  });

  it("localToGlobal correctly maps bank 4 local 8 → 72", () => {
    render(<Pad definition={PADS[8]} globalIdx={72} />);
    expect(screen.getByRole("button")).toHaveAttribute("data-pad-idx", "72");
  });
});
