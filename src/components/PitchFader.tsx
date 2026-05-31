import { useCallback, useEffect, useRef } from "react";
import "../styles/controls.css";
import { useMPCStore } from "../state/store";

type PitchFaderProps = {
  className?: string;
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function PitchFader({ className }: PitchFaderProps) {
  const fader = useMPCStore((s) => s.fader);
  const bpm = useMPCStore((s) => s.bpm);
  const setFader = useMPCStore((s) => s.setFader);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartVal = useRef<number>(0);

  // top=0 → fader=1 (high), bottom=1 → fader=0 (low)
  // knob top offset = (1 - fader) * trackHeight
  const knobTopPct = (1 - fader) * 100;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartVal.current = fader;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [fader],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragStartY.current === null) return;
      const trackEl = trackRef.current;
      const trackHeight = trackEl ? trackEl.getBoundingClientRect().height : 184;
      const delta = -(e.clientY - dragStartY.current) / trackHeight;
      setFader(clamp01(dragStartVal.current + delta));
    },
    [setFader],
  );

  const handlePointerUp = useCallback(() => {
    dragStartY.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let handled = true;
      const cur = useMPCStore.getState().fader;
      switch (e.key) {
        case "ArrowUp":
          setFader(clamp01(cur + 0.02));
          break;
        case "ArrowDown":
          setFader(clamp01(cur - 0.02));
          break;
        case "PageUp":
          setFader(clamp01(cur + 0.1));
          break;
        case "PageDown":
          setFader(clamp01(cur - 0.1));
          break;
        case "Home":
          setFader(0);
          break;
        case "End":
          setFader(1);
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    },
    [setFader],
  );

  // Prevent page scroll on wheel over fader
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = useMPCStore.getState().fader;
      setFader(clamp01(cur - e.deltaY * 0.002));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setFader]);

  return (
    <div
      ref={containerRef}
      className={`pitch-fader${className ? ` ${className}` : ""}`}
      role="slider"
      tabIndex={0}
      aria-label="Pitch / Tempo fader"
      aria-orientation="vertical"
      aria-valuemin={60}
      aria-valuemax={180}
      aria-valuenow={bpm}
      aria-valuetext={`${bpm} BPM`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <div ref={trackRef} className="fader-track">
        <div className="fader-knob" style={{ top: `${knobTopPct}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}
