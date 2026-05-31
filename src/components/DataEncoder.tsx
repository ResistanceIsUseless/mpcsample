import { useCallback, useEffect, useRef } from "react";
import "../styles/controls.css";
import { useMPCStore } from "../state/store";

export function DataEncoder() {
  const value = useMPCStore((s) => s.knobs.dataEnc);
  const setKnob = useMPCStore((s) => s.setKnob);

  // value is cumulative turns; convert to degrees for display
  const rotDeg = value * 360;

  const dragStartY = useRef<number | null>(null);
  const dragStartVal = useRef<number>(0);
  const encoderRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartVal.current = value;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragStartY.current === null) return;
      const delta = (dragStartY.current - e.clientY) / 200;
      setKnob("dataEnc", dragStartVal.current + delta);
    },
    [setKnob],
  );

  const handlePointerUp = useCallback(() => {
    dragStartY.current = null;
  }, []);

  // Wheel: deltaY * -0.5 degrees → convert to turns (/360)
  useEffect(() => {
    const el = encoderRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = useMPCStore.getState().knobs.dataEnc;
      // deltaY * -0.5 degrees = deltaY * -0.5 / 360 turns
      const delta = (e.deltaY * -0.5) / 360;
      setKnob("dataEnc", cur + delta);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setKnob]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let handled = true;
      const cur = useMPCStore.getState().knobs.dataEnc;
      // 5° per step = 5/360 turns
      switch (e.key) {
        case "ArrowUp":
          setKnob("dataEnc", cur + 5 / 360);
          break;
        case "ArrowDown":
          setKnob("dataEnc", cur - 5 / 360);
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    },
    [setKnob],
  );

  const displayDeg = Math.round(((rotDeg % 360) + 360) % 360);

  return (
    <div
      ref={encoderRef}
      className="data-encoder"
      role="slider"
      tabIndex={0}
      aria-label="Data encoder"
      aria-orientation="vertical"
      aria-valuenow={displayDeg}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuetext={`${displayDeg}°`}
      style={{ "--rot": `${rotDeg}deg` } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onKeyDown={handleKeyDown}
    />
  );
}
