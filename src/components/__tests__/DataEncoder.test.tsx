import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMPCStore } from "../../state/store";
import { DataEncoder } from "../DataEncoder";

beforeEach(() => {
  useMPCStore.setState({
    knobs: { k1: 0.5, k2: 0.5, k3: 0.5, mainVol: 0.8, dataEnc: 0 },
  });
});

describe("DataEncoder", () => {
  it("renders continuous slider", () => {
    render(<DataEncoder />);
    const slider = screen.getByRole("slider", { name: /data encoder/i });
    expect(slider).toBeInTheDocument();
  });

  it("aria-valuenow reflects rotation in degrees (0..360)", () => {
    render(<DataEncoder />);
    const slider = screen.getByRole("slider", { name: /data encoder/i });
    // role=slider requires aria-valuenow per WAI-ARIA; we expose the
    // current rotation in degrees, complementing aria-valuetext.
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "360");
  });

  it("has aria-valuetext describing rotation", () => {
    render(<DataEncoder />);
    const slider = screen.getByRole("slider", { name: /data encoder/i });
    // dataEnc=0 → 0° rotation
    expect(slider).toHaveAttribute("aria-valuetext", "0°");
  });

  it("ArrowUp rotates without clamp", () => {
    useMPCStore.setState({
      knobs: { k1: 0.5, k2: 0.5, k3: 0.5, mainVol: 0.8, dataEnc: 0.99 },
    });
    render(<DataEncoder />);
    const slider = screen.getByRole("slider", { name: /data encoder/i });
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    // Should exceed 1.0 — no clamp
    expect(useMPCStore.getState().knobs.dataEnc).toBeGreaterThan(0.99);
  });

  it("ArrowDown can go below 0 — continuous", () => {
    render(<DataEncoder />);
    const slider = screen.getByRole("slider", { name: /data encoder/i });
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(useMPCStore.getState().knobs.dataEnc).toBeLessThan(0);
  });

  it("drag pointerDown+pointerMove increases value", () => {
    render(<DataEncoder />);
    const slider = screen.getByRole("slider", { name: /data encoder/i });
    fireEvent.pointerDown(slider, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(slider, { pointerId: 1 });
    // Moved 100px up: delta = 100/200 = 0.5
    expect(useMPCStore.getState().knobs.dataEnc).toBeCloseTo(0.5, 1);
  });
});
