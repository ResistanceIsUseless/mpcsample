import { useCallback, useEffect } from "react";
import { useMPCStore } from "../state/store";

const ZOOM_STEP = 0.1;

/** Floating zoom-controls overlay for the MPC stage. */
export function ZoomControls() {
  const uiScale = useMPCStore((s) => s.uiScale);
  const zoomBy = useMPCStore((s) => s.zoomBy);
  const resetUiTransform = useMPCStore((s) => s.resetUiTransform);
  const setUiScale = useMPCStore((s) => s.setUiScale);

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(-ZOOM_STEP), [zoomBy]);

  const handleFit = useCallback(() => {
    const mpcEl = document.querySelector(".mpc");
    if (!mpcEl) return;
    const rect = mpcEl.getBoundingClientRect();
    const naturalW = rect.width / uiScale;
    const naturalH = rect.height / uiScale;
    const fitScale = Math.min(window.innerWidth / naturalW, window.innerHeight / naturalH);
    setUiScale(Math.max(0.5, Math.min(2, fitScale)));
  }, [uiScale, setUiScale]);

  const pct = Math.round(uiScale * 100);

  // Keyboard shortcuts: +/= zoom in, - zoom out, 0 reset.
  // Only fire when the event target is not an editable element.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      // If there's no target or it's a non-element (e.g. window/document), allow the shortcut.
      if (target?.tagName) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) {
          return;
        }
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomBy(-ZOOM_STEP);
      } else if (e.key === "0") {
        e.preventDefault();
        resetUiTransform();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomBy, resetUiTransform]);

  return (
    <div className="zoom-controls" role="group" aria-label="Zoom controls">
      {/* Live region so screen readers announce the current zoom % */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {`Zoom ${pct}%`}
      </span>

      <button type="button" className="zoom-btn" aria-label="Zoom out" onClick={zoomOut}>
        −
      </button>

      <span className="zoom-readout" aria-hidden="true">
        {`${pct}%`}
      </span>

      <button type="button" className="zoom-btn" aria-label="Zoom in" onClick={zoomIn}>
        +
      </button>

      <div className="zoom-divider" aria-hidden="true" />

      <button type="button" className="zoom-btn" aria-label="Reset zoom" onClick={resetUiTransform}>
        ⊙
      </button>

      <button type="button" className="zoom-btn" aria-label="Fit MPC to window" onClick={handleFit}>
        ⊡ Fit
      </button>
    </div>
  );
}
