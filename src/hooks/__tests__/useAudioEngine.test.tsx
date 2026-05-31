import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioEngine } from "../useAudioEngine";

// ---- Mock SampleEngine -------------------------------------------------------

const mockEngineInstance = {
  start: vi.fn().mockResolvedValue(undefined),
  trigger: vi.fn(),
  release: vi.fn(),
  setKit: vi.fn(),
  setKnob: vi.fn(),
  setMasterDb: vi.fn(),
  setBpm: vi.fn(),
  swapPadVoice: vi.fn(),
  getWaveform: vi.fn().mockReturnValue(new Float32Array(1024)),
  getSpectrum: vi.fn().mockReturnValue(new Float32Array(1024)),
  isReady: vi.fn().mockReturnValue(false),
  dispose: vi.fn(),
  loadKit: vi.fn().mockResolvedValue(undefined),
  setPadSample: vi.fn(),
  setPadTune: vi.fn(),
  setPadGain: vi.fn(),
  isPadLoading: vi.fn().mockReturnValue(false),
  prefetchAll: vi.fn().mockResolvedValue(undefined),
  registerImportedSample: vi.fn().mockResolvedValue(undefined),
};

// Regular (non-arrow) factory required by vitest v4 for `new`-construction.
function MockSampleEngineCtor() {
  return mockEngineInstance;
}

vi.mock("../../audio/SampleEngine", () => ({
  SampleEngine: vi.fn(MockSampleEngineCtor),
}));

// ---- Mock store -------------------------------------------------------------
// Use factory functions inside vi.mock to avoid hoisting issues.

vi.mock("../../state/store", () => {
  const mockSetEngineFn = vi.fn();
  const mockSetStartedFn = vi.fn();
  const mockSubscribeCleanup = vi.fn();
  const mockSubscribeFn = vi.fn(() => mockSubscribeCleanup);
  const mockEngineRef: { current: unknown } = { current: null };

  const useMPCStore = Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({
        setEngine: mockSetEngineFn,
        setStarted: mockSetStartedFn,
        // engineRef is read by the hook's StrictMode-safe cleanup; keep it
        // null so the conditional clear in unmount cleanup is safe.
        engineRef: mockEngineRef.current,
        activeKit: null,
      })),
      subscribe: mockSubscribeFn,
    },
  );

  return {
    useMPCStore,
    _cancelAllReleaseTimers: vi.fn(),
  };
});

// ---- Helper to get the mocked store internals at test time ------------------

async function getStoreMocks() {
  const { useMPCStore } = await import("../../state/store");
  const store = useMPCStore as unknown as {
    getState: () => {
      setEngine: ReturnType<typeof vi.fn>;
      setStarted: ReturnType<typeof vi.fn>;
    };
    subscribe: ReturnType<typeof vi.fn>;
  };
  return store;
}

// ---- Tests ------------------------------------------------------------------

describe("useAudioEngine", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockEngineInstance.start.mockResolvedValue(undefined);
    mockEngineInstance.dispose.mockReset();
    mockEngineInstance.isReady.mockReturnValue(false);

    // Re-setup subscribe mock after clearAllMocks
    const store = await getStoreMocks();
    store.subscribe.mockImplementation(() => vi.fn());
  });

  it("starts with isReady = false", () => {
    const { result } = renderHook(() => useAudioEngine());
    expect(result.current.isReady).toBe(false);
  });

  it("engine instance is created synchronously on mount", () => {
    const { result } = renderHook(() => useAudioEngine());
    // engine is created synchronously via useState initializer
    expect(result.current.engine).not.toBeNull();
  });

  it("start() calls engine.start, setEngine, and setStarted, then sets isReady = true", async () => {
    const store = await getStoreMocks();
    const { result } = renderHook(() => useAudioEngine());

    await act(async () => {
      await result.current.start();
    });

    expect(mockEngineInstance.start).toHaveBeenCalled();
    expect(store.getState().setEngine).toHaveBeenCalledWith(mockEngineInstance);
    expect(store.getState().setStarted).toHaveBeenCalledWith(true);
    expect(result.current.isReady).toBe(true);
  });

  it("dispose() calls engine.dispose, clears store engine ref, and sets isReady = false", async () => {
    const store = await getStoreMocks();
    const { result } = renderHook(() => useAudioEngine());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isReady).toBe(true);

    act(() => {
      result.current.dispose();
    });

    expect(mockEngineInstance.dispose).toHaveBeenCalled();
    expect(store.getState().setEngine).toHaveBeenLastCalledWith(null);
    expect(result.current.isReady).toBe(false);
  });

  it("unmount disposes engine and clears store ref", async () => {
    const store = await getStoreMocks();
    const { unmount } = renderHook(() => useAudioEngine());

    unmount();

    expect(mockEngineInstance.dispose).toHaveBeenCalled();
    expect(store.getState().setEngine).toHaveBeenCalledWith(null);
  });

  it("subscribes to store after isReady becomes true", async () => {
    const store = await getStoreMocks();
    const { result } = renderHook(() => useAudioEngine());

    // Before start, subscribe should not be called
    expect(store.subscribe).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.start();
    });

    // After start, subscribe should be set up
    expect(store.subscribe).toHaveBeenCalled();
  });

  it("unsubscribes from store on unmount after start", async () => {
    const store = await getStoreMocks();
    const mockCleanup = vi.fn();
    store.subscribe.mockImplementationOnce(() => mockCleanup);

    const { result, unmount } = renderHook(() => useAudioEngine());

    await act(async () => {
      await result.current.start();
    });

    unmount();

    expect(mockCleanup).toHaveBeenCalled();
  });
});
