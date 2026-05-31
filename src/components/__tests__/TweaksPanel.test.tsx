import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { TweaksPanel } from "../TweaksPanel";

vi.mock("../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => true, // skip animation delays in tests
}));

beforeEach(() => {
  useMPCStore.setState({
    ledColor: "BLUE",
    masterDb: 0,
    bpm: 120,
    fader: 0.5,
  });
});

function openPanel() {
  act(() => {
    window.dispatchEvent(new CustomEvent("mpc:open-tweaks"));
  });
}

describe("TweaksPanel", () => {
  it("has open=false class by default (not showing)", () => {
    render(<TweaksPanel />);
    const panel = document.querySelector(".tweaks");
    expect(panel).toBeTruthy();
    expect(panel?.className).not.toContain("open");
  });

  it("mpc:open-tweaks event opens the drawer", () => {
    render(<TweaksPanel />);
    openPanel();
    const panel = document.querySelector(".tweaks");
    expect(panel?.className).toContain("open");
  });

  it("has role=dialog when rendered", () => {
    render(<TweaksPanel />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
  });

  it("has aria-modal=true", () => {
    render(<TweaksPanel />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("has aria-labelledby pointing to heading", () => {
    render(<TweaksPanel />);
    const dialog = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const heading = labelId ? document.getElementById(labelId) : null;
    expect(heading?.textContent).toContain("TWEAKS");
  });

  it("Escape key closes the panel", () => {
    render(<TweaksPanel />);
    openPanel();
    const panel = document.querySelector(".tweaks");
    expect(panel).not.toBeNull();
    if (!panel) return;
    expect(panel.className).toContain("open");
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(panel.className).not.toContain("open");
  });

  it("close button closes the panel", () => {
    render(<TweaksPanel />);
    openPanel();
    const closeBtn = screen.getByRole("button", { name: /close tweaks/i });
    fireEvent.click(closeBtn);
    const panel = document.querySelector(".tweaks");
    expect(panel?.className).not.toContain("open");
  });

  it("LED GREEN click calls store.setLedColor('GREEN')", () => {
    const setLedColor = vi.fn();
    useMPCStore.setState({ setLedColor });
    render(<TweaksPanel />);
    openPanel();
    const greenBtn = screen.getByRole("button", { name: "GREEN" });
    fireEvent.click(greenBtn);
    expect(setLedColor).toHaveBeenCalledWith("GREEN");
  });

  it("Master volume slider calls store.setMasterDb", () => {
    const setMasterDb = vi.fn();
    useMPCStore.setState({ setMasterDb });
    render(<TweaksPanel />);
    openPanel();
    const slider = screen.getByRole("slider", { name: /master volume/i });
    fireEvent.change(slider, { target: { value: "-10" } });
    expect(setMasterDb).toHaveBeenCalledWith(-10);
  });

  it("BPM slider calls store.setBpm", () => {
    const setBpm = vi.fn();
    useMPCStore.setState({ setBpm });
    render(<TweaksPanel />);
    openPanel();
    const slider = screen.getByRole("slider", { name: /tempo/i });
    fireEvent.change(slider, { target: { value: "140" } });
    expect(setBpm).toHaveBeenCalledWith(140);
  });

  it("does NOT render a Hi-Hat Preset section", () => {
    render(<TweaksPanel />);
    openPanel();
    expect(screen.queryByText(/hi-hat preset/i)).not.toBeInTheDocument();
  });

  it("does NOT render a Drum Kit selector", () => {
    render(<TweaksPanel />);
    openPanel();
    expect(screen.queryByRole("button", { name: "HIP-HOP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "TRAP" })).not.toBeInTheDocument();
  });

  it("does NOT render a Pad → Sample map / voice select", () => {
    render(<TweaksPanel />);
    openPanel();
    expect(screen.queryByRole("combobox", { name: /voice/i })).not.toBeInTheDocument();
  });

  it("focus trap: Tab from last element wraps to first", () => {
    render(<TweaksPanel />);
    openPanel();
    const panel = document.querySelector(".tweaks") as HTMLElement;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute("disabled"));
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(panel, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(focusable[0]);
  });

  it("Visualizer 'Scope' click calls store.setVisualizerMode('oscilloscope')", () => {
    const setVisualizerMode = vi.fn();
    useMPCStore.setState({ setVisualizerMode });
    render(<TweaksPanel />);
    openPanel();
    const oscBtn = screen.getByRole("button", { name: "Scope" });
    fireEvent.click(oscBtn);
    expect(setVisualizerMode).toHaveBeenCalledWith("oscilloscope");
  });

  it("Visualizer 'Waveform' button has aria-pressed=true by default", () => {
    render(<TweaksPanel />);
    openPanel();
    const waveBtn = screen.getByRole("button", { name: "Waveform" });
    expect(waveBtn).toHaveAttribute("aria-pressed", "true");
  });
});
