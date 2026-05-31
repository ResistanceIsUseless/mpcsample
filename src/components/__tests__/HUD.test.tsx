import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { HUD } from "../HUD";

// Mock ExportButton to avoid pulling in the full exportKit dependency tree
// in HUD unit tests. ExportButton has its own test file.
vi.mock("../ExportButton", () => ({
  ExportButton: () => (
    <button type="button" aria-label="Export kit as Akai .xpj ZIP">
      &#x2B07; EXPORT .XPJ
    </button>
  ),
}));

beforeEach(() => {
  useMPCStore.setState({
    bankIdx: 0,
    activeKit: null,
    activeKitId: "HIP-HOP",
    midiStatus: "idle",
    midiDeviceName: null,
  });
});

describe("HUD", () => {
  it("displays the current bank letter from store", () => {
    render(<HUD />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("updates bank letter when bankIdx changes", () => {
    useMPCStore.setState({ bankIdx: 2 });
    render(<HUD />);
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("displays the kit name from store", () => {
    render(<HUD />);
    expect(screen.getByText("HIP-HOP")).toBeInTheDocument();
  });

  it("shows MIDI idle status by default", () => {
    render(<HUD />);
    expect(screen.getByText("MIDI: idle")).toBeInTheDocument();
  });

  it("shows connected MIDI device name when connected", () => {
    useMPCStore.setState({ midiStatus: "connected", midiDeviceName: "Akai Pro" });
    render(<HUD />);
    expect(screen.getByText("MIDI: Akai Pro")).toBeInTheDocument();
  });

  it("MIDI dot has 'ok' class when connected", () => {
    useMPCStore.setState({ midiStatus: "connected", midiDeviceName: "Akai Pro" });
    const { container } = render(<HUD />);
    const dot = container.querySelector(".dot");
    expect(dot?.className).toContain("ok");
  });

  it("MIDI dot does NOT have 'ok' class when not connected", () => {
    render(<HUD />);
    const { container } = render(<HUD />);
    const dot = container.querySelector(".dot");
    expect(dot?.className).not.toContain("ok");
  });

  it("TWEAKS button dispatches mpc:open-tweaks event", () => {
    render(<HUD />);
    const listener = vi.fn();
    window.addEventListener("mpc:open-tweaks", listener);
    const tweaksBtn = screen.getByRole("button", { name: /tweaks/i });
    fireEvent.click(tweaksBtn);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("mpc:open-tweaks", listener);
  });

  it("EDIT KIT button dispatches mpc:open-editor event", () => {
    render(<HUD />);
    const listener = vi.fn();
    window.addEventListener("mpc:open-editor", listener);
    const editBtn = screen.getByRole("button", { name: /kit editor/i });
    fireEvent.click(editBtn);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("mpc:open-editor", listener);
  });

  it("renders the ExportButton (export button present in HUD)", () => {
    render(<HUD />);
    // Mock renders a button with aria-label "Export kit as Akai .xpj ZIP"
    expect(screen.getByRole("button", { name: /export kit/i })).toBeInTheDocument();
  });

  it("displays keyboard shortcut hints", () => {
    render(<HUD />);
    expect(screen.getByText(/1234/)).toBeInTheDocument();
  });
});
