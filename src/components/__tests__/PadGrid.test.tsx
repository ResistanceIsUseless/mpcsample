import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SamplePad } from "../../kits/kit.types";
import { useMPCStore } from "../../state/store";
import { PadGrid } from "../PadGrid";

// Mock useReducedMotion
vi.mock("../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setState = (s: Record<string, unknown>) => useMPCStore.setState(s as any);

beforeEach(() => {
  const pads: Record<number, "idle" | "armed" | "press"> = {};
  for (let i = 0; i < 128; i++) pads[i] = "armed";
  const padMap: Record<number, SamplePad | null> = {};
  for (let i = 0; i < 128; i++) padMap[i] = null;
  setState({ pads, padMap, bankIdx: 0, loadingPads: {} });
});

describe("PadGrid", () => {
  it("renders 16 pads", () => {
    render(<PadGrid />);
    const pads = screen.getAllByRole("button");
    expect(pads).toHaveLength(16);
  });

  it("all 16 pads have unique data-pad-idx from 0 to 15 when on bank A", () => {
    render(<PadGrid />);
    const pads = screen.getAllByRole("button");
    const indices = pads.map((p) => Number(p.getAttribute("data-pad-idx")));
    indices.sort((a, b) => a - b);
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("pads show indices 16–31 when bank B is active", () => {
    act(() => {
      setState({ bankIdx: 1 });
    });
    render(<PadGrid />);
    const pads = screen.getAllByRole("button");
    const indices = pads.map((p) => Number(p.getAttribute("data-pad-idx")));
    indices.sort((a, b) => a - b);
    expect(indices).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
  });

  it("top-left visual cell has aria-label containing 'Pad 13' (localIdx 12, first cell in layout row 0)", () => {
    render(<PadGrid />);
    const btn = screen.getByRole("button", { name: /Pad 13/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("data-pad-idx", "12");
  });

  it("bottom-left visual cell has aria-label containing 'Pad 1' (localIdx 0, first cell in layout row 3)", () => {
    render(<PadGrid />);
    const btn = screen.getByRole("button", { name: /Pad 1 —/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("data-pad-idx", "0");
  });

  it("top-left cell on bank B has data-pad-idx=28 (localIdx 12, bankIdx 1 → 1*16+12=28)", () => {
    act(() => {
      setState({ bankIdx: 1 });
    });
    render(<PadGrid />);
    const btn = screen.getByRole("button", { name: /Pad 13/i });
    expect(btn).toHaveAttribute("data-pad-idx", "28");
  });

  it("renders the pad-frame and pad-grid wrappers", () => {
    const { container } = render(<PadGrid />);
    expect(container.querySelector(".pad-frame")).toBeInTheDocument();
    expect(container.querySelector(".pad-grid")).toBeInTheDocument();
  });

  it("pad shows sample displayName when padMap has an entry for the global index", () => {
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
    const padMap: Record<number, SamplePad | null> = {};
    for (let i = 0; i < 128; i++) padMap[i] = null;
    padMap[0] = samplePad;
    act(() => {
      setState({ padMap });
    });
    render(<PadGrid />);
    // Pad 1 (bottom-left, localIdx=0) should show sample displayName
    expect(screen.getByText("808 Kick")).toBeInTheDocument();
  });

  it("pad shows loading indicator when loadingPads has an entry for the global index", () => {
    act(() => {
      setState({ loadingPads: { 0: true } });
    });
    render(<PadGrid />);
    const { container } = render(<PadGrid />);
    const loadingIndicators = container.querySelectorAll(".pad-loading");
    // At least one loading indicator should appear (pad index 0 in bank A)
    expect(loadingIndicators.length).toBeGreaterThan(0);
  });
});
