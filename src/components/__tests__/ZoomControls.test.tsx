import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { ZoomControls } from "../ZoomControls";

// Capture the real store action references before any test can replace them
// with spies via `useMPCStore.setState({ zoomBy: vi.fn() })`.
const realZoomBy = useMPCStore.getState().zoomBy;
const realResetUiTransform = useMPCStore.getState().resetUiTransform;

// ── Reset store before each test ───────────────────────────────────────────────

beforeEach(() => {
  // Reset both state AND the action references so readout tests use real actions.
  useMPCStore.setState({
    uiScale: 1,
    uiOffset: { x: 0, y: 0 },
    zoomBy: realZoomBy,
    resetUiTransform: realResetUiTransform,
  });
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("ZoomControls rendering", () => {
  it("renders zoom-in button", () => {
    render(<ZoomControls />);
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
  });

  it("renders zoom-out button", () => {
    render(<ZoomControls />);
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument();
  });

  it("renders reset button", () => {
    render(<ZoomControls />);
    expect(screen.getByRole("button", { name: /reset zoom/i })).toBeInTheDocument();
  });

  it("displays 100% readout at default scale", () => {
    render(<ZoomControls />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("displays correct percentage for non-default scale", () => {
    useMPCStore.setState({ uiScale: 1.5 });
    render(<ZoomControls />);
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("has a group role with accessible label", () => {
    render(<ZoomControls />);
    expect(screen.getByRole("group", { name: /zoom controls/i })).toBeInTheDocument();
  });

  it("has an sr-only live region for screen-reader announcements", () => {
    render(<ZoomControls />);
    const live = screen.getByRole("status");
    expect(live).toBeInTheDocument();
    expect(live.textContent).toMatch(/100%/);
  });
});

// ── Button interactions ───────────────────────────────────────────────────────

describe("ZoomControls interactions", () => {
  it("zoom-in button calls zoomBy(+0.1)", () => {
    const zoomBy = vi.fn();
    useMPCStore.setState({ zoomBy } as never);
    render(<ZoomControls />);
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(zoomBy).toHaveBeenCalledWith(0.1);
  });

  it("zoom-out button calls zoomBy(-0.1)", () => {
    const zoomBy = vi.fn();
    useMPCStore.setState({ zoomBy } as never);
    render(<ZoomControls />);
    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    expect(zoomBy).toHaveBeenCalledWith(-0.1);
  });

  it("reset button calls resetUiTransform", () => {
    const resetUiTransform = vi.fn();
    useMPCStore.setState({ resetUiTransform } as never);
    render(<ZoomControls />);
    fireEvent.click(screen.getByRole("button", { name: /reset zoom/i }));
    expect(resetUiTransform).toHaveBeenCalled();
  });

  it("readout updates after zoom-in click", () => {
    render(<ZoomControls />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    });
    // uiScale should now be 1.1 → 110%. Check the live region which is one text node.
    const live = screen.getByRole("status");
    expect(live.textContent).toContain("110%");
  });

  it("readout updates after zoom-out click", () => {
    render(<ZoomControls />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    });
    // uiScale should now be 0.9 → 90%.
    const live = screen.getByRole("status");
    expect(live.textContent).toContain("90%");
  });

  it("readout resets to 100% after reset click", () => {
    act(() => {
      useMPCStore.setState({ uiScale: 1.5 });
    });
    render(<ZoomControls />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /reset zoom/i }));
    });
    // Verify live region shows 100% after reset.
    const live = screen.getByRole("status");
    expect(live.textContent).toContain("100%");
  });
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

describe("ZoomControls keyboard shortcuts", () => {
  it("+ key fires zoomBy(+0.1)", () => {
    const zoomBy = vi.fn();
    useMPCStore.setState({ zoomBy } as never);
    render(<ZoomControls />);
    act(() => {
      fireEvent.keyDown(window, { key: "+" });
    });
    expect(zoomBy).toHaveBeenCalledWith(0.1);
  });

  it("= key also fires zoomBy(+0.1)", () => {
    const zoomBy = vi.fn();
    useMPCStore.setState({ zoomBy } as never);
    render(<ZoomControls />);
    act(() => {
      fireEvent.keyDown(window, { key: "=" });
    });
    expect(zoomBy).toHaveBeenCalledWith(0.1);
  });

  it("- key fires zoomBy(-0.1)", () => {
    const zoomBy = vi.fn();
    useMPCStore.setState({ zoomBy } as never);
    render(<ZoomControls />);
    act(() => {
      fireEvent.keyDown(window, { key: "-" });
    });
    expect(zoomBy).toHaveBeenCalledWith(-0.1);
  });

  it("0 key fires resetUiTransform", () => {
    const resetUiTransform = vi.fn();
    useMPCStore.setState({ resetUiTransform } as never);
    render(<ZoomControls />);
    act(() => {
      fireEvent.keyDown(window, { key: "0" });
    });
    expect(resetUiTransform).toHaveBeenCalled();
  });

  it("+ key does NOT fire when target is an input", () => {
    const zoomBy = vi.fn();
    useMPCStore.setState({ zoomBy } as never);
    render(<ZoomControls />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      fireEvent.keyDown(input, { key: "+" });
    });
    expect(zoomBy).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("+ key does NOT fire when target is a textarea", () => {
    const zoomBy = vi.fn();
    useMPCStore.setState({ zoomBy } as never);
    render(<ZoomControls />);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    act(() => {
      fireEvent.keyDown(textarea, { key: "+" });
    });
    expect(zoomBy).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });
});
