/* eslint-disable @typescript-eslint/no-empty-function */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../store";

// ── localStorage mock ─────────────────────────────────────────────────────────

let store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    store = {};
  }),
  length: 0,
  key: vi.fn(() => null),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// ── Reset store before each test ───────────────────────────────────────────────

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
  useMPCStore.setState({ uiScale: 1, uiOffset: { x: 0, y: 0 } });
});

afterEach(() => {
  useMPCStore.setState({ uiScale: 1, uiOffset: { x: 0, y: 0 } });
});

// ── setUiScale ────────────────────────────────────────────────────────────────

describe("setUiScale", () => {
  it("sets the scale to the given value", () => {
    useMPCStore.getState().setUiScale(1.5);
    expect(useMPCStore.getState().uiScale).toBe(1.5);
  });

  it("clamps below 0.5 to 0.5", () => {
    useMPCStore.getState().setUiScale(0.1);
    expect(useMPCStore.getState().uiScale).toBe(0.5);
  });

  it("clamps above 2 to 2", () => {
    useMPCStore.getState().setUiScale(5);
    expect(useMPCStore.getState().uiScale).toBe(2);
  });

  it("rounds to 2 decimal places", () => {
    useMPCStore.getState().setUiScale(1.234567);
    expect(useMPCStore.getState().uiScale).toBe(1.23);
  });

  it("persists to localStorage", () => {
    useMPCStore.getState().setUiScale(1.5);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "mpc.uiTransform",
      expect.stringContaining('"uiScale":1.5'),
    );
  });
});

// ── zoomBy ────────────────────────────────────────────────────────────────────

describe("zoomBy", () => {
  it("increases scale by the given delta", () => {
    useMPCStore.setState({ uiScale: 1 });
    useMPCStore.getState().zoomBy(0.1);
    expect(useMPCStore.getState().uiScale).toBeCloseTo(1.1, 2);
  });

  it("decreases scale by negative delta", () => {
    useMPCStore.setState({ uiScale: 1 });
    useMPCStore.getState().zoomBy(-0.1);
    expect(useMPCStore.getState().uiScale).toBeCloseTo(0.9, 2);
  });

  it("clamps at 0.5 lower bound", () => {
    useMPCStore.setState({ uiScale: 0.6 });
    useMPCStore.getState().zoomBy(-0.5);
    expect(useMPCStore.getState().uiScale).toBe(0.5);
  });

  it("clamps at 2 upper bound", () => {
    useMPCStore.setState({ uiScale: 1.9 });
    useMPCStore.getState().zoomBy(0.5);
    expect(useMPCStore.getState().uiScale).toBe(2);
  });

  it("accumulates across multiple calls", () => {
    useMPCStore.setState({ uiScale: 1 });
    useMPCStore.getState().zoomBy(0.1);
    useMPCStore.getState().zoomBy(0.1);
    expect(useMPCStore.getState().uiScale).toBeCloseTo(1.2, 2);
  });

  it("persists to localStorage", () => {
    useMPCStore.getState().zoomBy(0.1);
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });
});

// ── nudgeUiOffset ─────────────────────────────────────────────────────────────

describe("nudgeUiOffset", () => {
  it("adds dx/dy to the current offset", () => {
    useMPCStore.setState({ uiOffset: { x: 10, y: 20 } });
    useMPCStore.getState().nudgeUiOffset(5, -10);
    expect(useMPCStore.getState().uiOffset).toEqual({ x: 15, y: 10 });
  });

  it("accumulates across multiple nudges", () => {
    useMPCStore.setState({ uiOffset: { x: 0, y: 0 } });
    useMPCStore.getState().nudgeUiOffset(10, 0);
    useMPCStore.getState().nudgeUiOffset(10, 0);
    expect(useMPCStore.getState().uiOffset.x).toBe(20);
  });

  it("persists to localStorage", () => {
    useMPCStore.getState().nudgeUiOffset(5, 5);
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });
});

// ── setUiOffset ───────────────────────────────────────────────────────────────

describe("setUiOffset", () => {
  it("sets the offset to the given absolute coordinates", () => {
    useMPCStore.getState().setUiOffset(100, 200);
    expect(useMPCStore.getState().uiOffset).toEqual({ x: 100, y: 200 });
  });

  it("overwrites the previous offset", () => {
    useMPCStore.setState({ uiOffset: { x: 50, y: 50 } });
    useMPCStore.getState().setUiOffset(0, 0);
    expect(useMPCStore.getState().uiOffset).toEqual({ x: 0, y: 0 });
  });

  it("persists to localStorage", () => {
    useMPCStore.getState().setUiOffset(30, 40);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "mpc.uiTransform",
      expect.stringContaining('"x":30'),
    );
  });
});

// ── resetUiTransform ──────────────────────────────────────────────────────────

describe("resetUiTransform", () => {
  it("resets scale to 1", () => {
    useMPCStore.setState({ uiScale: 1.75 });
    useMPCStore.getState().resetUiTransform();
    expect(useMPCStore.getState().uiScale).toBe(1);
  });

  it("resets offset to (0, 0)", () => {
    useMPCStore.setState({ uiOffset: { x: 200, y: -50 } });
    useMPCStore.getState().resetUiTransform();
    expect(useMPCStore.getState().uiOffset).toEqual({ x: 0, y: 0 });
  });

  it("persists the reset to localStorage", () => {
    useMPCStore.getState().resetUiTransform();
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "mpc.uiTransform",
      JSON.stringify({ uiScale: 1, uiOffset: { x: 0, y: 0 } }),
    );
  });
});

// ── localStorage round-trip ───────────────────────────────────────────────────

describe("localStorage persistence round-trip", () => {
  it("writes uiScale and uiOffset after setUiScale", () => {
    useMPCStore.getState().setUiScale(1.5);
    const raw = store["mpc.uiTransform"];
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw) as { uiScale: number; uiOffset: { x: number; y: number } };
    expect(parsed.uiScale).toBe(1.5);
    expect(parsed.uiOffset).toEqual({ x: 0, y: 0 });
  });

  it("writes uiOffset and current uiScale after setUiOffset", () => {
    useMPCStore.getState().setUiScale(1.2);
    useMPCStore.getState().setUiOffset(50, 75);
    const raw = store["mpc.uiTransform"];
    const parsed = JSON.parse(raw) as { uiScale: number; uiOffset: { x: number; y: number } };
    expect(parsed.uiScale).toBe(1.2);
    expect(parsed.uiOffset).toEqual({ x: 50, y: 75 });
  });

  it("does not throw when localStorage is unavailable", () => {
    const originalSetItem = localStorageMock.setItem;
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => useMPCStore.getState().setUiScale(1.3)).not.toThrow();
    localStorageMock.setItem.mockImplementation(originalSetItem);
  });
});
