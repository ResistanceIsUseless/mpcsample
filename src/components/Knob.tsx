import { useCallback, useRef } from "react";
import "../styles/controls.css";
import { useMPCStore } from "../state/store";
import type { KnobName } from "../types/mpc.types";

export type KnobSize = "sm" | "md" | "lg";
export type KnobVariant = "silver" | "gold";

type KnobProps = {
  name: KnobName;
  label: string;
  size?: KnobSize;
  variant?: KnobVariant;
};

const SIZE_TO_ORIGIN: Record<KnobSize, string> = {
  sm: "50% 20px",
  md: "50% 28px",
  lg: "50% 34px",
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function Knob({ name, label, size = "md", variant = "silver" }: KnobProps) {
  const isContinuous = name === "dataEnc";
  const value = useMPCStore((s) => s.knobs[name]);
  const setKnob = useMPCStore((s) => s.setKnob);

  const dragStartY = useRef<number | null>(null);
  const dragStartVal = useRef<number>(0);

  const rotDeg = isContinuous
    ? value * 360 // continuous: treat value as turns, show as degrees
    : -135 + 270 * value;

  const capRef = useRef<HTMLDivElement>(null);

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
      const next = isContinuous
        ? dragStartVal.current + delta
        : clamp01(dragStartVal.current + delta);
      setKnob(name, next);
    },
    [isContinuous, name, setKnob],
  );

  const handlePointerUp = useCallback(() => {
    dragStartY.current = null;
  }, []);


  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let handled = true;
      const cur = useMPCStore.getState().knobs[name];
      switch (e.key) {
        case "ArrowUp":
          setKnob(name, isContinuous ? cur + 0.05 : clamp01(cur + 0.05));
          break;
        case "ArrowDown":
          setKnob(name, isContinuous ? cur - 0.05 : clamp01(cur - 0.05));
          break;
        case "PageUp":
          setKnob(name, isContinuous ? cur + 0.1 : clamp01(cur + 0.1));
          break;
        case "PageDown":
          setKnob(name, isContinuous ? cur - 0.1 : clamp01(cur - 0.1));
          break;
        case "Home":
          if (!isContinuous) setKnob(name, 0);
          break;
        case "End":
          if (!isContinuous) setKnob(name, 1);
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    },
    [isContinuous, name, setKnob],
  );

  const ariaValueNow = isContinuous ? undefined : Math.round(value * 100);
  const ariaValueText = isContinuous ? `${Math.round(rotDeg % 360)}°` : undefined;

  return (
    <div
      className="knob"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={isContinuous ? undefined : 0}
      aria-valuemax={isContinuous ? undefined : 100}
      aria-valuenow={ariaValueNow}
      aria-valuetext={ariaValueText}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={capRef}
        className={`knob-cap ${size}${variant === "gold" ? " gold" : ""}`}
        style={
          {
            "--rot": `${rotDeg}deg`,
            transformOrigin: SIZE_TO_ORIGIN[size],
          } as React.CSSProperties
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="knob-name">{label}</div>
    </div>
  );
}
