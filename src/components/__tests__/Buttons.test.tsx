import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { EraseButtons } from "../EraseButtons";
import { ModeButtons } from "../ModeButtons";
import { PadPlayButtons } from "../PadPlayButtons";
import { UtilityButtons } from "../UtilityButtons";

vi.mock("../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

beforeEach(() => {
  useMPCStore.setState({
    bankIdx: 0,
    bpm: 120,
    fader: 0.5,
  });
});

describe("ModeButtons", () => {
  it("renders MODE label", () => {
    render(<ModeButtons />);
    expect(screen.getByText("MODE")).toBeInTheDocument();
  });

  it("SAMPLE button starts with aria-pressed=false", () => {
    render(<ModeButtons />);
    const btn = screen.getByRole("button", { name: "SAMPLE" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("SAMPLE click toggles aria-pressed to true", () => {
    render(<ModeButtons />);
    const btn = screen.getByRole("button", { name: "SAMPLE" });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("SAMPLE click again toggles back to false", () => {
    render(<ModeButtons />);
    const btn = screen.getByRole("button", { name: "SAMPLE" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("PAD BANK button calls store.cycleBank on click", () => {
    const cycleBank = vi.fn();
    useMPCStore.setState({ cycleBank });
    render(<ModeButtons />);
    const btn = screen.getByRole("button", { name: /cycle pad bank/i });
    fireEvent.click(btn);
    expect(cycleBank).toHaveBeenCalledTimes(1);
  });

  it("SHIFT button toggles is-on class", () => {
    render(<ModeButtons />);
    const btn = screen.getByRole("button", { name: "SHIFT" });
    fireEvent.click(btn);
    expect(btn.className).toContain("is-on");
  });
});

describe("PadPlayButtons", () => {
  it("renders PAD PLAY label", () => {
    render(<PadPlayButtons />);
    expect(screen.getByText("PAD PLAY")).toBeInTheDocument();
  });

  it("CHOP starts with aria-pressed=false", () => {
    render(<PadPlayButtons />);
    const btn = screen.getByRole("button", { name: "CHOP" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("CHOP toggles on click", () => {
    render(<PadPlayButtons />);
    const btn = screen.getByRole("button", { name: "CHOP" });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("all four cyan buttons rendered", () => {
    render(<PadPlayButtons />);
    expect(screen.getByRole("button", { name: "CHOP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MUTE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LOOP" })).toBeInTheDocument();
    // "16 LEVELS" may render with line break
    const levels = screen.getAllByRole("button");
    const levelsBtn = levels.find((b) => b.textContent?.replace(/\s/g, " ").trim().includes("16"));
    expect(levelsBtn).toBeDefined();
  });
});

describe("EraseButtons", () => {
  it("renders ERASE and NOTE RPT buttons", () => {
    render(<EraseButtons />);
    expect(screen.getByRole("button", { name: /erase/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /note repeat/i })).toBeInTheDocument();
  });
});

describe("UtilityButtons", () => {
  it("renders UNDO and REDO buttons", () => {
    render(<UtilityButtons />);
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /redo/i })).toBeInTheDocument();
  });

  it("TAP TEMPO: 4 clicks at ~500ms intervals sets bpm to ~120", () => {
    const setBpm = vi.fn();
    useMPCStore.setState({ setBpm });
    render(<UtilityButtons />);
    const tapBtn = screen.getByRole("button", { name: /tap tempo/i });

    // Simulate 4 taps at t=0, 500, 1000, 1500ms
    const now = Date.now();

    // Tap 1
    vi.spyOn(Date, "now").mockReturnValue(now);
    fireEvent.click(tapBtn);

    // Tap 2 at +500ms
    vi.spyOn(Date, "now").mockReturnValue(now + 500);
    fireEvent.click(tapBtn);

    // Tap 3 at +1000ms
    vi.spyOn(Date, "now").mockReturnValue(now + 1000);
    fireEvent.click(tapBtn);

    // Tap 4 at +1500ms
    vi.spyOn(Date, "now").mockReturnValue(now + 1500);
    fireEvent.click(tapBtn);

    // After 4 taps, setBpm should have been called with ~120 BPM
    expect(setBpm).toHaveBeenCalled();
    const lastCall = setBpm.mock.calls[setBpm.mock.calls.length - 1][0];
    // Should be close to 120 BPM (60000/500=120)
    expect(Math.abs(lastCall - 120)).toBeLessThanOrEqual(5);

    vi.restoreAllMocks();
  });

  it("UNDO/REDO buttons are rendered and clickable without errors", () => {
    render(<UtilityButtons />);
    const undoBtn = screen.getByRole("button", { name: /undo/i });
    const redoBtn = screen.getByRole("button", { name: /redo/i });
    // Should not throw
    fireEvent.click(undoBtn);
    fireEvent.click(redoBtn);
    expect(undoBtn).toBeInTheDocument();
    expect(redoBtn).toBeInTheDocument();
  });
});
