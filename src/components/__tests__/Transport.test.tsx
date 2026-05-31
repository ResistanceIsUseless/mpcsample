import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Transport } from "../Transport";

beforeEach(() => {
  // No store deps for Transport
});

describe("Transport", () => {
  it("renders PLAY button with aria-label 'Play'", () => {
    render(<Transport />);
    const playBtn = screen.getByRole("button", { name: "Play" });
    expect(playBtn).toBeInTheDocument();
  });

  it("renders STOP button with aria-label 'Stop'", () => {
    render(<Transport />);
    const stopBtn = screen.getByRole("button", { name: "Stop" });
    expect(stopBtn).toBeInTheDocument();
  });

  it("PLAY click dispatches mpc:transport-play CustomEvent", () => {
    render(<Transport />);
    const handler = vi.fn();
    window.addEventListener("mpc:transport-play", handler);
    const playBtn = screen.getByRole("button", { name: "Play" });
    fireEvent.click(playBtn);
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener("mpc:transport-play", handler);
  });

  it("STOP click dispatches mpc:transport-stop CustomEvent", () => {
    render(<Transport />);
    const handler = vi.fn();
    window.addEventListener("mpc:transport-stop", handler);
    const stopBtn = screen.getByRole("button", { name: "Stop" });
    fireEvent.click(stopBtn);
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener("mpc:transport-stop", handler);
  });

  it("PLAY button has play-btn CSS class", () => {
    render(<Transport />);
    const playBtn = screen.getByRole("button", { name: "Play" });
    expect(playBtn.className).toContain("play-btn");
  });

  it("STOP button has stop-btn CSS class", () => {
    render(<Transport />);
    const stopBtn = screen.getByRole("button", { name: "Stop" });
    expect(stopBtn.className).toContain("stop-btn");
  });

  it("clicking PLAY adds is-on class to play button", () => {
    render(<Transport />);
    const playBtn = screen.getByRole("button", { name: "Play" });
    fireEvent.click(playBtn);
    expect(playBtn.className).toContain("is-on");
  });

  it("clicking STOP after PLAY removes is-on from play button", () => {
    render(<Transport />);
    const playBtn = screen.getByRole("button", { name: "Play" });
    const stopBtn = screen.getByRole("button", { name: "Stop" });
    fireEvent.click(playBtn);
    fireEvent.click(stopBtn);
    expect(playBtn.className).not.toContain("is-on");
    expect(stopBtn.className).toContain("is-on");
  });
});
