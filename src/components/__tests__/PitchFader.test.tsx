import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMPCStore } from "../../state/store";
import { PitchFader } from "../PitchFader";

beforeEach(() => {
  useMPCStore.setState({ fader: 0.5, bpm: 120 });
});

describe("PitchFader", () => {
  it("renders slider with aria-orientation vertical", () => {
    render(<PitchFader />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-orientation", "vertical");
  });

  it("has aria-valuemin=60 and aria-valuemax=180", () => {
    render(<PitchFader />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuemin", "60");
    expect(slider).toHaveAttribute("aria-valuemax", "180");
  });

  it("aria-valuenow reflects current bpm", () => {
    render(<PitchFader />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuenow", "120");
  });

  it("aria-valuetext includes BPM label", () => {
    render(<PitchFader />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuetext", "120 BPM");
  });

  it("ArrowUp increases fader value", () => {
    render(<PitchFader />);
    const slider = screen.getByRole("slider");
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(useMPCStore.getState().fader).toBeCloseTo(0.52, 5);
  });

  it("ArrowDown decreases fader value", () => {
    render(<PitchFader />);
    const slider = screen.getByRole("slider");
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(useMPCStore.getState().fader).toBeCloseTo(0.48, 5);
  });

  it("Home sets fader to 0 (bpm=60)", () => {
    render(<PitchFader />);
    const slider = screen.getByRole("slider");
    slider.focus();
    fireEvent.keyDown(slider, { key: "Home" });
    expect(useMPCStore.getState().fader).toBe(0);
    expect(useMPCStore.getState().bpm).toBe(60);
  });

  it("End sets fader to 1 (bpm=180)", () => {
    render(<PitchFader />);
    const slider = screen.getByRole("slider");
    slider.focus();
    fireEvent.keyDown(slider, { key: "End" });
    expect(useMPCStore.getState().fader).toBe(1);
    expect(useMPCStore.getState().bpm).toBe(180);
  });

  it("drag bottom to top increases bpm in store", () => {
    render(<PitchFader />);
    const slider = screen.getByRole("slider");
    // Simulate drag upward on the container (clientY decreases = fader increases)
    fireEvent.pointerDown(slider, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(slider, { pointerId: 1 });
    // fader should increase from 0.5
    expect(useMPCStore.getState().fader).toBeGreaterThan(0.5);
    expect(useMPCStore.getState().bpm).toBeGreaterThan(120);
  });

  it("fader knob position reflects value", () => {
    useMPCStore.setState({ fader: 1.0, bpm: 180 });
    render(<PitchFader />);
    const knob = document.querySelector(".fader-knob") as HTMLElement;
    expect(knob).toBeTruthy();
    // At fader=1, top should be 0%
    expect(knob.style.top).toBe("0%");
  });
});
