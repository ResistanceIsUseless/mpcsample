import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { StartOverlay } from "../StartOverlay";

beforeEach(() => {
  useMPCStore.setState({ isStarted: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StartOverlay", () => {
  it("renders with role='dialog' and aria-modal='true'", () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartOverlay onStart={onStart} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("has aria-labelledby pointing to the heading", () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartOverlay onStart={onStart} />);
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const heading = document.getElementById(labelledBy!);
    expect(heading).toBeInTheDocument();
    expect(heading?.textContent).toContain("MPC SAMPLE");
  });

  it("START button is present", () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartOverlay onStart={onStart} />);
    expect(screen.getByRole("button", { name: /START/i })).toBeInTheDocument();
  });

  it("clicking START calls onStart", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartOverlay onStart={onStart} />);
    const btn = screen.getByRole("button", { name: /START/i });
    fireEvent.click(btn);
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
  });

  it("overlay disappears after onStart resolves (store.isStarted=true)", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartOverlay onStart={onStart} />);
    const btn = screen.getByRole("button", { name: /START/i });
    await act(async () => {
      fireEvent.click(btn);
      // Let onStart resolve (microtask)
      await Promise.resolve();
      await Promise.resolve();
    });
    // After real timers: wait for the 220ms setTimeout to fire
    await waitFor(
      () => {
        expect(useMPCStore.getState().isStarted).toBe(true);
      },
      { timeout: 500 },
    );
  });

  it("does not render when isStarted is already true", () => {
    useMPCStore.setState({ isStarted: true });
    const onStart = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<StartOverlay onStart={onStart} />);
    expect(container.firstChild).toBeNull();
  });

  it("Tab key focus stays within the dialog", () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<StartOverlay onStart={onStart} />);
    const dialog = screen.getByRole("dialog");
    const btn = screen.getByRole("button", { name: /START/i });
    btn.focus();
    // Tab should be intercepted — the handler calls e.preventDefault() and refocuses
    fireEvent.keyDown(dialog, { key: "Tab" });
    // The handler prevents default; focus stays on btn since it's the only focusable element
    expect(document.activeElement).toBe(btn);
  });
});
