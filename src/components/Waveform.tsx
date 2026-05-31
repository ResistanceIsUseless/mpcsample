import { useCallback, useEffect, useRef } from "react";
import { useWaveformDraw } from "../hooks/useWaveformDraw";
import { useMPCStore } from "../state/store";
import type { AudioEngineLike } from "../types/mpc.types";

type WaveformProps = {
  engine: AudioEngineLike | null;
};

export function Waveform({ engine }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualizerMode = useMPCStore((s) => s.visualizerMode);
  const lastTriggeredPad = useMPCStore((s) => s.lastTriggeredPad);

  // Keep a ref so getBuffer reads the latest pad without being recreated on
  // every hit — avoids resetting lastWaveformBuf in useWaveformDraw each time
  // a pad is triggered, which would cause a 1-frame flash to the flat line.
  const lastTriggeredPadRef = useRef(lastTriggeredPad);
  useEffect(() => {
    lastTriggeredPadRef.current = lastTriggeredPad;
  }, [lastTriggeredPad]);

  const getBuffer = useCallback(() => {
    if (!engine) return null;
    if (visualizerMode === "fft") return engine.getSpectrum();
    if (visualizerMode === "waveform") {
      const idx = lastTriggeredPadRef.current ?? 0;
      const data = engine.getPadChannelData?.(idx) ?? null;
      if (data !== null) return data;
      // Null means either loading (keep previous) or truly empty (show blank).
      // Return an empty array for empty pads so the draw loop resets to flat line.
      return engine.isPadLoading(idx) ? null : new Float32Array(0);
    }
    return engine.getWaveform(); // oscilloscope
  }, [engine, visualizerMode]);

  useWaveformDraw(canvasRef, engine ? getBuffer : null, visualizerMode);

  return (
    <div className="waveform">
      <canvas ref={canvasRef} />
    </div>
  );
}
