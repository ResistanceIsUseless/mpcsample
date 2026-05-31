import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Auto-unmount React Testing Library renders between tests to prevent
// listener accumulation. NOTE: cleanup() does not reliably unmount
// renderHook trees in this jsdom + React 19 + Vitest 4 combination;
// hook-focused test files should use a `mountHook` helper that captures
// `unmount` and calls it in afterEach.
afterEach(() => {
  cleanup();
  // Clear spy call history. Without this, vi.spyOn on the same property in
  // a subsequent test can return the same SpyInstance with leftover history
  // (vitest 4 + Zustand store action property quirk).
  vi.clearAllMocks();
});

/* eslint-disable @typescript-eslint/no-empty-function */

// Polyfill PointerEvent for jsdom (jsdom does not implement it). Extending
// MouseEvent preserves clientX/clientY from the event init; we add the
// pointer-specific fields (notably `pressure`) that components read for
// velocity. Without this, `fireEvent.pointerDown(el, { clientY, pressure })`
// produces an event missing those props, yielding NaN/wrong values in drag and
// pressure-sensitivity tests.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;
    readonly tangentialPressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly twist: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
      this.pointerType = params.pointerType ?? "";
      this.isPrimary = params.isPrimary ?? false;
    }
  }
  // jsdom global + window both need the constructor for fireEvent + handlers.
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

// Mock matchMedia for jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver for jsdom
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock Pointer Events API (jsdom doesn't implement setPointerCapture/hasPointerCapture)
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
