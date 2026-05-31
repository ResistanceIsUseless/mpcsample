import { useCallback, useRef } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useMPCStore } from "../state/store";
import type { AudioEngineLike } from "../types/mpc.types";
import { BankSelector } from "./BankSelector";
import { DataEncoder } from "./DataEncoder";
import { DisplayPanel } from "./DisplayPanel";
import { EraseButtons } from "./EraseButtons";
import { Knob } from "./Knob";
import { ModeButtons } from "./ModeButtons";
import { PadGrid } from "./PadGrid";
import { PadPlayButtons } from "./PadPlayButtons";
import { PitchFader } from "./PitchFader";
import { Transport } from "./Transport";
import { UtilityButtons } from "./UtilityButtons";

// Sensitivity: how much one pixel of pointer movement maps to offset pixels.
const DRAG_SENSITIVITY = 1;

// Ctrl/Cmd+wheel zoom factor: pixels of deltaY → scale delta.
const WHEEL_ZOOM_FACTOR = 0.001;

// Class added to interactive MPC controls so we can skip drag initiation on them.
const DRAG_HANDLE_CLASS = "mpc-drag-handle";

type MPCDeviceProps = {
  engine?: AudioEngineLike | null;
};

export function MPCDevice({ engine = null }: MPCDeviceProps) {
  const uiScale = useMPCStore((s) => s.uiScale);
  const uiOffset = useMPCStore((s) => s.uiOffset);
  const zoomBy = useMPCStore((s) => s.zoomBy);
  const setUiOffset = useMPCStore((s) => s.setUiOffset);
  const reducedMotion = useReducedMotion();

  const isDragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number }>({
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
  });
  const viewportRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only initiate drag from the drag handle itself.
      const target = e.target as HTMLElement;
      if (!target.classList.contains(DRAG_HANDLE_CLASS)) return;

      isDragging.current = true;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        ox: uiOffset.x,
        oy: uiOffset.y,
      };

      const viewport = viewportRef.current;
      if (viewport) {
        viewport.classList.add("is-dragging");
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [uiOffset],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return;
      const dx = (e.clientX - dragStart.current.x) * DRAG_SENSITIVITY;
      const dy = (e.clientY - dragStart.current.y) * DRAG_SENSITIVITY;
      setUiOffset(dragStart.current.ox + dx, dragStart.current.oy + dy);
    },
    [setUiOffset],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.classList.remove("is-dragging");
    }
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(-e.deltaY * WHEEL_ZOOM_FACTOR);
    },
    [zoomBy],
  );

  // When user scale is not 1 we suppress the CSS media-query on .mpc
  // (which would otherwise double-apply a transform).
  const isScaled = uiScale !== 1;

  const stageStyle: React.CSSProperties = {
    transform: `translate(${uiOffset.x}px, ${uiOffset.y}px) scale(${uiScale})`,
    transformOrigin: "top center",
    // Disable smooth transition during drag or when reduced motion is on.
    transition: reducedMotion ? "none" : undefined,
  };

  return (
    <div
      ref={viewportRef}
      className={["mpc-viewport", isScaled ? "mpc-stage--scaled" : ""].filter(Boolean).join(" ")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {/* Drag handle: sits behind the MPC but covers the whole viewport */}
      <div className={DRAG_HANDLE_CLASS} aria-hidden="true" />

      <div className="mpc-stage" style={stageStyle}>
        <div className="mpc-frame">
          <div className="mpc">
            {/* Display panel: logo + vol + screen + speaker */}
            <DisplayPanel engine={engine} />

            {/* Body grid: 3 columns */}
            <div className="body-grid">
              {/* LEFT COLUMN: modes + shift + pitch fader + erase */}
              <div className="col-left">
                <ModeButtons />
                <PitchFader />
                <EraseButtons />
              </div>

              {/* CENTER COLUMN: knobs + bank selector + pad grid */}
              <div className="col-center">
                <div className="knob-row">
                  <Knob name="k1" label="K1" />
                  <Knob name="k2" label="K2" />
                  <Knob name="k3" label="K3" />
                </div>
                <BankSelector />
                <PadGrid />
              </div>

              {/* RIGHT COLUMN: pad play + utility + data encoder + transport */}
              <div className="col-right">
                <PadPlayButtons />
                <UtilityButtons />
                <DataEncoder />
                <Transport />
              </div>
            </div>

            <div className="wrist" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
