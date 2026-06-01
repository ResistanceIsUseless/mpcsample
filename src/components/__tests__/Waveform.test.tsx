import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { Waveform } from "../Waveform";

// Mock useWaveformDraw to capture calls
const mockUseWaveformDraw = vi.fn();
vi.mock("../../hooks/useWaveformDraw", () => ({
  useWaveformDraw: (...args: unknown[]) => mockUseWaveformDraw(...args),
}));

beforeEach(() => {
  mockUseWaveformDraw.mockReset();
  useMPCStore.setState({ visualizerMode: "fft" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Waveform", () => {
  it("renders a canvas element", () => {
    const { container } = render(<Waveform engine={null} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("renders with waveform wrapper div", () => {
    const { container } = render(<Waveform engine={null} />);
    expect(container.querySelector(".waveform")).toBeInTheDocument();
  });

  it("passes null getBuffer to useWaveformDraw when engine is null", () => {
    render(<Waveform engine={null} />);
    expect(mockUseWaveformDraw).toHaveBeenCalledWith(
      expect.objectContaining({ current: expect.anything() }),
      null,
      expect.any(String),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("passes getBuffer function to useWaveformDraw when engine is provided", () => {
    useMPCStore.setState({ visualizerMode: "oscilloscope" });
    const fakeEngine = {
      start: vi.fn(),
      trigger: vi.fn(),
      release: vi.fn(),
      setKit: vi.fn(),
      setKnob: vi.fn(),
      setMasterDb: vi.fn(),
      setBpm: vi.fn(),
      swapPadVoice: vi.fn(),
      getWaveform: vi.fn().mockReturnValue(new Float32Array(512)),
      getSpectrum: vi.fn().mockReturnValue(new Float32Array(1024)),
      isReady: vi.fn().mockReturnValue(true),
      dispose: vi.fn(),
    };
    render(<Waveform engine={fakeEngine} />);
    // getBuffer should be a function (non-null)
    const [, getBuffer] = mockUseWaveformDraw.mock.calls[0];
    expect(typeof getBuffer).toBe("function");
    expect(getBuffer()).toBeInstanceOf(Float32Array);
  });

  it("calls getSpectrum (not getWaveform) when visualizerMode is 'fft'", () => {
    useMPCStore.setState({ visualizerMode: "fft" });
    const fakeEngine = {
      start: vi.fn(),
      trigger: vi.fn(),
      release: vi.fn(),
      setKit: vi.fn(),
      setKnob: vi.fn(),
      setMasterDb: vi.fn(),
      setBpm: vi.fn(),
      swapPadVoice: vi.fn(),
      getWaveform: vi.fn().mockReturnValue(new Float32Array(512)),
      getSpectrum: vi.fn().mockReturnValue(new Float32Array(1024)),
      isReady: vi.fn().mockReturnValue(true),
      dispose: vi.fn(),
    };
    render(<Waveform engine={fakeEngine} />);
    const [, getBuffer] = mockUseWaveformDraw.mock.calls[0];
    // Invoke the callback — it should call getSpectrum, not getWaveform
    const result = getBuffer() as Float32Array;
    expect(fakeEngine.getSpectrum).toHaveBeenCalled();
    expect(fakeEngine.getWaveform).not.toHaveBeenCalled();
    expect(result.length).toBe(1024);
  });

  it("calls getWaveform (not getSpectrum) when visualizerMode is 'oscilloscope'", () => {
    useMPCStore.setState({ visualizerMode: "oscilloscope" });
    const fakeEngine = {
      start: vi.fn(),
      trigger: vi.fn(),
      release: vi.fn(),
      setKit: vi.fn(),
      setKnob: vi.fn(),
      setMasterDb: vi.fn(),
      setBpm: vi.fn(),
      swapPadVoice: vi.fn(),
      getWaveform: vi.fn().mockReturnValue(new Float32Array(512)),
      getSpectrum: vi.fn().mockReturnValue(new Float32Array(1024)),
      isReady: vi.fn().mockReturnValue(true),
      dispose: vi.fn(),
    };
    render(<Waveform engine={fakeEngine} />);
    const [, getBuffer] = mockUseWaveformDraw.mock.calls[0];
    // Invoke the callback — it should call getWaveform, not getSpectrum
    const result = getBuffer() as Float32Array;
    expect(fakeEngine.getWaveform).toHaveBeenCalled();
    expect(fakeEngine.getSpectrum).not.toHaveBeenCalled();
    expect(result.length).toBe(512);
  });
});
