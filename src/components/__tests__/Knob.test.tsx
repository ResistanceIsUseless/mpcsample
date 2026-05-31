import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { Knob } from "../Knob";

vi.mock("../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

beforeEach(() => {
  useMPCStore.setState({
    knobs: { k1: 0.5, k2: 0.5, k3: 0.5, mainVol: 0.8, dataEnc: 0 },
  });
});

describe("Knob", () => {
  it("renders with role=slider and label", () => {
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    expect(slider).toBeInTheDocument();
  });

  it("default value comes from store (50 = 0.5)", () => {
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    expect(slider).toHaveAttribute("aria-valuenow", "50");
  });

  it("ArrowUp increases value by 0.05", () => {
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(useMPCStore.getState().knobs.k1).toBeCloseTo(0.55, 5);
  });

  it("ArrowDown decreases value by 0.05", () => {
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(useMPCStore.getState().knobs.k1).toBeCloseTo(0.45, 5);
  });

  it("Home sets value to 0", () => {
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "Home" });
    expect(useMPCStore.getState().knobs.k1).toBe(0);
  });

  it("End sets value to 1", () => {
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "End" });
    expect(useMPCStore.getState().knobs.k1).toBe(1);
  });

  it("PageUp increases value by 0.1", () => {
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(useMPCStore.getState().knobs.k1).toBeCloseTo(0.6, 5);
  });

  it("PageDown decreases value by 0.1", () => {
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "PageDown" });
    expect(useMPCStore.getState().knobs.k1).toBeCloseTo(0.4, 5);
  });

  it("aria-valuenow updates after keyboard interaction", () => {
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps value to 0 at minimum", () => {
    useMPCStore.setState({ knobs: { k1: 0.02, k2: 0.5, k3: 0.5, mainVol: 0.8, dataEnc: 0 } });
    render(<Knob name="k1" label="K1" />);
    const slider = screen.getByRole("slider", { name: "K1" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(useMPCStore.getState().knobs.k1).toBeGreaterThanOrEqual(0);
  });

  it("drag: pointerDown then pointerMove deltaY=-100 increases value", () => {
    render(<Knob name="k1" label="K1" />);
    // Find the cap div (child of slider)
    const slider = screen.getByRole("slider", { name: "K1" });
    const cap = slider.querySelector(".knob-cap") as HTMLElement;
    expect(cap).toBeTruthy();
    // deltaY=-100 means upward drag → value +0.5
    fireEvent.pointerDown(cap, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(cap, { clientY: 0, pointerId: 1 }); // moved 100px up
    fireEvent.pointerUp(cap, { pointerId: 1 });
    // delta = (100 - 0) / 200 = 0.5; new val = 0.5 + 0.5 = 1.0 (clamped)
    expect(useMPCStore.getState().knobs.k1).toBeCloseTo(1.0, 1);
  });

  it("has aria-valuemin=0 and aria-valuemax=100", () => {
    render(<Knob name="k2" label="K2" />);
    const slider = screen.getByRole("slider", { name: "K2" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
  });

  it("renders label text below knob", () => {
    render(<Knob name="mainVol" label="MAIN VOLUME" />);
    expect(screen.getByText("MAIN VOLUME")).toBeInTheDocument();
  });
});
