import type { RenderHookResult } from "@testing-library/react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { useKeyboardInput } from "../useKeyboardInput";

// renderHook helper that tracks unmount so afterEach can release listeners.
// `cleanup()` from @testing-library/react v16 does not reliably unmount
// renderHook trees in this jsdom + React 19 + Vitest 4 combination.
const trackedUnmounts: Array<() => void> = [];
function mountHook<R, P>(
  cb: (initialProps: P) => R,
  options?: Parameters<typeof renderHook<R, P>>[1],
): RenderHookResult<R, P> {
  const r = renderHook(cb, options);
  trackedUnmounts.push(r.unmount);
  return r;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useMPCStore.setState({
    pads: (() => {
      const p: Record<number, string> = {};
      for (let i = 0; i < 16; i++) p[i] = "armed";
      return p as Parameters<typeof useMPCStore.setState>[0]["pads"];
    })(),
  });
}

function fireKeydown(key: string, options: Partial<KeyboardEventInit> = {}) {
  act(() => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, ...options });
    // jsdom drops the `repeat` field from KeyboardEvent init dict, so we
    // forcibly set it here when the caller asked for it.
    if (options.repeat !== undefined) {
      Object.defineProperty(event, "repeat", {
        value: options.repeat,
        writable: false,
        configurable: true,
      });
    }
    window.dispatchEvent(event);
  });
}

function fireKeyup(key: string, options: Partial<KeyboardEventInit> = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, ...options }));
  });
}

beforeEach(() => {
  resetStore();
  // restoreAllMocks restores the original implementation, but vitest 4 leaves
  // the mock object in place so vi.spyOn() returns the SAME spy on subsequent
  // calls — preserving call history. Clear all mocks first to reset call data.
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// Explicit unmount: cleanup() doesn't reliably unmount renderHook in this env.
afterEach(() => {
  trackedUnmounts.forEach((u) => {
    u();
  });
  trackedUnmounts.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useKeyboardInput", () => {
  it("keydown 'z' → triggerPad(0, 0.9)", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    fireKeydown("z");
    expect(triggerPad).toHaveBeenCalledWith(0, 0.9);
  });

  it("keydown 'x' → triggerPad(1, 0.9)", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    fireKeydown("x");
    expect(triggerPad).toHaveBeenCalledWith(1, 0.9);
  });

  it("keydown '1' → triggerPad(12, 0.9) (top-left visual = idx 12)", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    fireKeydown("1");
    expect(triggerPad).toHaveBeenCalledWith(12, 0.9);
  });

  it("keydown 'q' → triggerPad(8, 0.9)", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    fireKeydown("q");
    expect(triggerPad).toHaveBeenCalledWith(8, 0.9);
  });

  it("keydown 'a' → triggerPad(4, 0.9)", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    fireKeydown("a");
    expect(triggerPad).toHaveBeenCalledWith(4, 0.9);
  });

  it("keyup 'z' → releasePad(0)", () => {
    const releasePad = vi.spyOn(useMPCStore.getState(), "releasePad");
    mountHook(() => useKeyboardInput(true));
    fireKeyup("z");
    expect(releasePad).toHaveBeenCalledWith(0);
  });

  it("keyup '1' → releasePad(12)", () => {
    const releasePad = vi.spyOn(useMPCStore.getState(), "releasePad");
    mountHook(() => useKeyboardInput(true));
    fireKeyup("1");
    expect(releasePad).toHaveBeenCalledWith(12);
  });

  it("e.repeat true → triggerPad not called", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    fireKeydown("z", { repeat: true });
    expect(triggerPad).not.toHaveBeenCalled();
  });

  it("target is INPUT → triggerPad not called", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true }));
    });
    expect(triggerPad).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("target is TEXTAREA → triggerPad not called", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true }));
    });
    expect(triggerPad).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("target is SELECT → triggerPad not called", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    const select = document.createElement("select");
    document.body.appendChild(select);
    act(() => {
      select.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true }));
    });
    expect(triggerPad).not.toHaveBeenCalled();
    document.body.removeChild(select);
  });

  // Note: jsdom does not implement `isContentEditable` (returns undefined),
  // so this particular defensive check cannot be integration-tested in jsdom.
  // The guard works in real browsers where isContentEditable is properly defined.
  it("target is contenteditable div (jsdom limitation: isContentEditable unsupported — skip)", () => {
    // jsdom returns undefined for isContentEditable, so we verify the falsy check
    // doesn't incorrectly block other keys (i.e. the guard is not over-broad).
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    const div = document.createElement("div");
    // jsdom: contentEditable attribute set but isContentEditable is undefined
    div.contentEditable = "true";
    expect(div.isContentEditable).toBeFalsy(); // confirm jsdom limitation
    document.body.appendChild(div);
    document.body.removeChild(div);
    // Verify the hook still works for normal window events
    fireKeydown("z");
    expect(triggerPad).toHaveBeenCalledWith(0, 0.9);
  });

  it("enabled=false → no listeners attached", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(false));
    fireKeydown("z");
    expect(triggerPad).not.toHaveBeenCalled();
  });

  it("unmapped key → triggerPad not called", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    fireKeydown("p"); // not in KEY_TO_IDX
    expect(triggerPad).not.toHaveBeenCalled();
  });

  it("listeners are removed on unmount", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    const { unmount } = mountHook(() => useKeyboardInput(true));
    unmount();
    fireKeydown("z");
    expect(triggerPad).not.toHaveBeenCalled();
  });

  it("uppercase key is normalised — Shift+z='Z' maps same as 'z'", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    mountHook(() => useKeyboardInput(true));
    fireKeydown("Z"); // e.key with shift held
    expect(triggerPad).toHaveBeenCalledWith(0, 0.9);
  });

  it("switching enabled from false → true starts listening", () => {
    const triggerPad = vi.spyOn(useMPCStore.getState(), "triggerPad");
    const { rerender } = mountHook(
      ({ enabled }: { enabled: boolean }) => useKeyboardInput(enabled),
      { initialProps: { enabled: false } },
    );
    fireKeydown("z");
    expect(triggerPad).not.toHaveBeenCalled();
    rerender({ enabled: true });
    fireKeydown("z");
    expect(triggerPad).toHaveBeenCalledWith(0, 0.9);
  });
});
