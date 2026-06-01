import { useCallback, useEffect, useMemo, useRef } from "react";
import { useWaveformDraw } from "../hooks/useWaveformDraw";
import { useMPCStore } from "../state/store";
import type { AudioEngineLike } from "../types/mpc.types";

type WaveformProps = {
  engine: AudioEngineLike | null;
  viewStart?: number;
  viewEnd?: number;
  onViewChange?: (start: number, end: number) => void;
};

const MIN_SPAN = 0.0005;

export function Waveform({ engine, viewStart = 0, viewEnd = 1, onViewChange }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const visualizerMode = useMPCStore((s) => s.visualizerMode);
  const lastTriggeredPad = useMPCStore((s) => s.lastTriggeredPad);
  const padMap = useMPCStore((s) => s.padMap);
  const _loadingPads = useMPCStore((s) => s.loadingPads);
  const setPadTrim = useMPCStore((s) => s.setPadTrim);
  const setKnob = useMPCStore((s) => s.setKnob);

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
      return engine.isPadLoading(idx) ? null : new Float32Array(0);
    }
    return engine.getWaveform();
  }, [engine, visualizerMode]);

  useWaveformDraw(canvasRef, engine ? getBuffer : null, visualizerMode, viewStart, viewEnd);

  // ── Trim state ────────────────────────────────────────────────────────────

  const frameCount = useMemo(() => {
    void _loadingPads;
    if (!engine || lastTriggeredPad === null) return 0;
    return engine.getPadChannelData?.(lastTriggeredPad)?.length ?? 0;
  }, [engine, lastTriggeredPad, _loadingPads]);

  const triggeredPadData = lastTriggeredPad !== null ? padMap[lastTriggeredPad] : null;
  const trimStartFrames = triggeredPadData?.sampleStart ?? (frameCount > 0 ? 0 : null);
  const trimEndFrames = triggeredPadData?.sampleEnd ?? (frameCount > 0 ? frameCount : null);

  // Keep the current view in a ref so handlers always see fresh values
  const viewRef = useRef({ start: viewStart, end: viewEnd });
  viewRef.current = { start: viewStart, end: viewEnd };

  // ── Zoom: non-passive wheel listener so preventDefault works ─────────────

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const handleWheel = (e: WheelEvent) => {
      // Let Ctrl/Meta+wheel bubble up to the viewport zoom handler
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (!onViewChange) return;
      const rect = wrap.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const { start, end } = viewRef.current;
      const anchorFrac = start + fx * (end - start);
      const span = end - start;
      const factor = e.deltaY > 0 ? 1.25 : 1 / 1.25;
      const newSpan = Math.min(1, Math.max(MIN_SPAN, span * factor));
      let newStart = anchorFrac - fx * newSpan;
      let newEnd = newStart + newSpan;
      if (newStart < 0) {
        newStart = 0;
        newEnd = newSpan;
      }
      if (newEnd > 1) {
        newEnd = 1;
        newStart = 1 - newSpan;
      }
      onViewChange(newStart, newEnd);
    };
    wrap.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", handleWheel);
  }, [onViewChange]);

  const handleDoubleClick = useCallback(() => {
    onViewChange?.(0, 1);
  }, [onViewChange]);

  // ── Trim handle drag ──────────────────────────────────────────────────────

  const trimDragRef = useRef<{
    handle: "start" | "end";
    otherFrames: number;
  } | null>(null);

  const handleTrimPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, which: "start" | "end") => {
      e.stopPropagation();
      if (lastTriggeredPad === null || frameCount <= 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const currentStart = trimStartFrames ?? 0;
      const currentEnd = trimEndFrames ?? frameCount;
      trimDragRef.current = {
        handle: which,
        otherFrames: which === "start" ? currentEnd : currentStart,
      };
    },
    [lastTriggeredPad, frameCount, trimStartFrames, trimEndFrames],
  );

  const handleTrimPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = trimDragRef.current;
      if (!drag || lastTriggeredPad === null || frameCount <= 0) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const { start, end } = viewRef.current;
      const bufFrac = start + frac * (end - start);
      const newFrame = Math.round(bufFrac * frameCount);
      if (drag.handle === "start") {
        const clamped = Math.max(0, Math.min(drag.otherFrames - 1, newFrame));
        setPadTrim(lastTriggeredPad, clamped, drag.otherFrames);
        setKnob("k1", clamped / frameCount);
      } else {
        const clamped = Math.min(frameCount, Math.max(drag.otherFrames + 1, newFrame));
        setPadTrim(lastTriggeredPad, drag.otherFrames, clamped);
        setKnob("k2", clamped / frameCount);
      }
    },
    [lastTriggeredPad, frameCount, setPadTrim, setKnob],
  );

  const handleTrimPointerUp = useCallback(() => {
    trimDragRef.current = null;
  }, []);

  // ── Trim handle positioning ───────────────────────────────────────────────

  const frameToPct = (frame: number) => {
    if (frameCount <= 0) return 0;
    const bufFrac = frame / frameCount;
    const viewFrac = (bufFrac - viewStart) / (viewEnd - viewStart);
    return Math.max(0, Math.min(100, viewFrac * 100));
  };

  const showTrimHandles =
    visualizerMode === "waveform" &&
    frameCount > 0 &&
    trimStartFrames !== null &&
    trimEndFrames !== null;

  return (
    <div
      ref={wrapRef}
      role="application"
      aria-label="Waveform view — scroll to zoom, double-click to reset"
      className="waveform"
      onDoubleClick={handleDoubleClick}
      style={{ cursor: "default" }}
    >
      <canvas ref={canvasRef} />

      {showTrimHandles && trimStartFrames !== null && trimEndFrames !== null && (
        <>
          <div
            data-trim-handle="start"
            className="trim-handle trim-handle-start"
            style={{ left: `${frameToPct(trimStartFrames)}%` }}
            onPointerDown={(e) => handleTrimPointerDown(e, "start")}
            onPointerMove={handleTrimPointerMove}
            onPointerUp={handleTrimPointerUp}
          />
          <div
            data-trim-handle="end"
            className="trim-handle trim-handle-end"
            style={{ left: `${frameToPct(trimEndFrames)}%` }}
            onPointerDown={(e) => handleTrimPointerDown(e, "end")}
            onPointerMove={handleTrimPointerMove}
            onPointerUp={handleTrimPointerUp}
          />
        </>
      )}
    </div>
  );
}
