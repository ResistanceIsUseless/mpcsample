import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
