import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { MPCDevice } from "../MPCDevice";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

// Stub all inner components so we only test MPCDevice's own wrapper logic.
vi.mock("../DisplayPanel", () => ({ DisplayPanel: () => <div data-testid="display-panel" /> }));
vi.mock("../PadGrid", () => ({ PadGrid: () => <div data-testid="pad-grid" /> }));
vi.mock("../BankSelector", () => ({ BankSelector: () => <div data-testid="bank-selector" /> }));
vi.mock("../Knob", () => ({ Knob: () => <div data-testid="knob" /> }));
vi.mock("../ModeButtons", () => ({ ModeButtons: () => <div data-testid="mode-buttons" /> }));
vi.mock("../EraseButtons", () => ({ EraseButtons: () => <div data-testid="erase-buttons" /> }));
vi.mock("../PitchFader", () => ({ PitchFader: () => <div data-testid="pitch-fader" /> }));
vi.mock("../PadPlayButtons", () => ({
  PadPlayButtons: () => <div data-testid="pad-play-buttons" />,
}));
vi.mock("../UtilityButtons", () => ({
  UtilityButtons: () => <div data-testid="utility-buttons" />,
}));
vi.mock("../DataEncoder", () => ({ DataEncoder: () => <div data-testid="data-encoder" /> }));
vi.mock("../Transport", () => ({ Transport: () => <div data-testid="transport" /> }));

// ── Reset store before each test ───────────────────────────────────────────────

beforeEach(() => {
  useMPCStore.setState({ uiScale: 1, uiOffset: { x: 0, y: 0 } });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStage(container: HTMLElement): HTMLElement {
  const el = container.querySelector(".mpc-stage");
  if (!el) throw new Error(".mpc-stage not found");
  return el as HTMLElement;
}

function getViewport(container: HTMLElement): HTMLElement {
  const el = container.querySelector(".mpc-viewport");
  if (!el) throw new Error(".mpc-viewport not found");
  return el as HTMLElement;
}

// ── Structure tests ───────────────────────────────────────────────────────────

describe("MPCDevice structure", () => {
  it("renders .mpc-viewport wrapper", () => {
    const { container } = render(<MPCDevice />);
    expect(container.querySelector(".mpc-viewport")).toBeInTheDocument();
  });

  it("renders .mpc-stage inside viewport", () => {
    const { container } = render(<MPCDevice />);
    expect(container.querySelector(".mpc-stage")).toBeInTheDocument();
  });

  it("renders .mpc-frame inside stage", () => {
    const { container } = render(<MPCDevice />);
    expect(container.querySelector(".mpc-frame")).toBeInTheDocument();
  });

  it("renders inner MPC content", () => {
    render(<MPCDevice />);
    expect(screen.getByTestId("pad-grid")).toBeInTheDocument();
  });
});

// ── Transform tests ───────────────────────────────────────────────────────────

describe("MPCDevice transform reflects store state", () => {
  it("applies scale(1) translate(0px, 0px) at default state", () => {
    const { container } = render(<MPCDevice />);
    const stage = getStage(container);
    expect(stage.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("applies scale from uiScale store value", () => {
    useMPCStore.setState({ uiScale: 1.5 });
    const { container } = render(<MPCDevice />);
    const stage = getStage(container);
    expect(stage.style.transform).toContain("scale(1.5)");
  });

  it("applies offset from uiOffset store value", () => {
    useMPCStore.setState({ uiOffset: { x: 100, y: -50 } });
    const { container } = render(<MPCDevice />);
    const stage = getStage(container);
    expect(stage.style.transform).toContain("translate(100px, -50px)");
  });

  it("updates inline transform when uiScale changes in store", () => {
    const { container } = render(<MPCDevice />);
    act(() => {
      useMPCStore.setState({ uiScale: 0.75 });
    });
    const stage = getStage(container);
    expect(stage.style.transform).toContain("scale(0.75)");
  });
});

// ── mpc-stage--scaled class ───────────────────────────────────────────────────

describe("mpc-stage--scaled class", () => {
  it("is absent when uiScale is 1", () => {
    useMPCStore.setState({ uiScale: 1 });
    const { container } = render(<MPCDevice />);
    const viewport = getViewport(container);
    expect(viewport.classList.contains("mpc-stage--scaled")).toBe(false);
  });

  it("is present when uiScale is not 1", () => {
    useMPCStore.setState({ uiScale: 1.2 });
    const { container } = render(<MPCDevice />);
    const viewport = getViewport(container);
    expect(viewport.classList.contains("mpc-stage--scaled")).toBe(true);
  });

  it("is present when uiScale is less than 1", () => {
    useMPCStore.setState({ uiScale: 0.8 });
    const { container } = render(<MPCDevice />);
    const viewport = getViewport(container);
    expect(viewport.classList.contains("mpc-stage--scaled")).toBe(true);
  });
});

// ── Wheel zoom ────────────────────────────────────────────────────────────────

describe("MPCDevice Ctrl+wheel zoom", () => {
  it("calls zoomBy when ctrl+wheel fires on viewport", () => {
    const zoomBy = vi.fn();
    useMPCStore.setState({ zoomBy } as never);
    const { container } = render(<MPCDevice />);
    const viewport = getViewport(container);
    fireEvent.wheel(viewport, { deltaY: -100, ctrlKey: true });
    expect(zoomBy).toHaveBeenCalled();
  });

  it("does NOT call zoomBy when wheel fires without ctrl key", () => {
    const zoomBy = vi.fn();
    useMPCStore.setState({ zoomBy } as never);
    const { container } = render(<MPCDevice />);
    const viewport = getViewport(container);
    fireEvent.wheel(viewport, { deltaY: -100, ctrlKey: false, metaKey: false });
    expect(zoomBy).not.toHaveBeenCalled();
  });
});

// ── Drag handle ───────────────────────────────────────────────────────────────

describe("MPCDevice drag handle", () => {
  it("renders a drag handle element with aria-hidden", () => {
    const { container } = render(<MPCDevice />);
    const handle = container.querySelector(".mpc-drag-handle");
    expect(handle).toBeInTheDocument();
    expect(handle).toHaveAttribute("aria-hidden", "true");
  });

  it("pointer drag on handle updates uiOffset via setUiOffset", () => {
    const setUiOffset = vi.fn();
    useMPCStore.setState({ setUiOffset } as never);
    const { container } = render(<MPCDevice />);
    const handle = container.querySelector(".mpc-drag-handle") as HTMLElement;

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 150, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(setUiOffset).toHaveBeenCalledWith(50, 20);
  });
});
