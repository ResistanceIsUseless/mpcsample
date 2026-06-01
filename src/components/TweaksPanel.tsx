import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/controls.css";
import { LED_COLOR_NAMES } from "../data/ledColors";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useMPCStore } from "../state/store";
import type { LedColor } from "../types/mpc.types";

/** All focusable elements inside the panel (for focus trap). */
const FOCUSABLE_SELECTORS = 'button, [href], input, select, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (el) => !el.hasAttribute("disabled"),
  );
}

export function TweaksPanel() {
  const [open, setOpen] = useState(false);

  const prefersReducedMotion = useReducedMotion();

  const ledColor = useMPCStore((s) => s.ledColor);
  const masterDb = useMPCStore((s) => s.masterDb);
  const bpm = useMPCStore((s) => s.bpm);
  const dialogPosition = useMPCStore((s) => s.dialogPosition);
  const autoOpenExportFolder = useMPCStore((s) => s.autoOpenExportFolder);
  const unmountAfterExport = useMPCStore((s) => s.unmountAfterExport);
  const visualizerMode = useMPCStore((s) => s.visualizerMode);
  const midiStatus = useMPCStore((s) => s.midiStatus);
  const midiInputs = useMPCStore((s) => s.midiInputs);
  const preferredMidiDeviceName = useMPCStore((s) => s.preferredMidiDeviceName);
  const setVisualizerMode = useMPCStore((s) => s.setVisualizerMode);
  const setLedColor = useMPCStore((s) => s.setLedColor);
  const setMasterDb = useMPCStore((s) => s.setMasterDb);
  const setBpm = useMPCStore((s) => s.setBpm);
  const setFader = useMPCStore((s) => s.setFader);
  const setDialogPosition = useMPCStore((s) => s.setDialogPosition);
  const setAutoOpenExportFolder = useMPCStore((s) => s.setAutoOpenExportFolder);
  const setUnmountAfterExport = useMPCStore((s) => s.setUnmountAfterExport);
  const setPreferredMidiDeviceName = useMPCStore((s) => s.setPreferredMidiDeviceName);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  // Listen for toggle event from HUD
  useEffect(() => {
    const handler = () => {
      setOpen((prev) => {
        if (!prev) lastFocusRef.current = document.activeElement as HTMLElement;
        return !prev;
      });
    };
    window.addEventListener("mpc:open-tweaks", handler);
    return () => window.removeEventListener("mpc:open-tweaks", handler);
  }, []);

  // Focus first element when opened
  useEffect(() => {
    if (open) {
      const id = setTimeout(
        () => {
          closeBtnRef.current?.focus();
        },
        prefersReducedMotion ? 0 : 220,
      );
      return () => clearTimeout(id);
    } else {
      lastFocusRef.current?.focus();
    }
    return undefined;
  }, [open, prefersReducedMotion]);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  // Escape to close + focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePanel();
        return;
      }

      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = getFocusableElements(panel);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [closePanel],
  );

  const handleLedClick = useCallback(
    (color: LedColor) => {
      setLedColor(color);
    },
    [setLedColor],
  );

  const handleMasterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMasterDb(Number(e.target.value));
    },
    [setMasterDb],
  );

  const handleBpmChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      setBpm(next);
      setFader((next - 60) / 120);
    },
    [setBpm, setFader],
  );

  const panelClass = `tweaks${open ? " open" : ""}`;

  const style: React.CSSProperties = prefersReducedMotion ? { transition: "none" } : {};

  return (
    <div
      ref={panelRef}
      className={panelClass}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tweaks-heading"
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      <header>
        <h3 id="tweaks-heading">TWEAKS</h3>
        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Close tweaks panel"
          onClick={closePanel}
        >
          ×
        </button>
      </header>

      {/* Visualizer mode */}
      <div className="tw-section">
        <div className="tw-segs" role="group" aria-labelledby="tweaks-visualizer-label">
          <span id="tweaks-visualizer-label" style={{ position: "absolute", left: "-9999px" }}>
            Visualizer
          </span>
          <span className="tw-segs-label">Visualizer</span>
          {(
            [
              { value: "waveform", label: "Waveform" },
              { value: "fft", label: "FFT" },
              { value: "oscilloscope", label: "Scope" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`tw-seg${visualizerMode === value ? " on" : ""}`}
              aria-pressed={visualizerMode === value}
              onClick={() => setVisualizerMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Pad LED Color */}
      <div className="tw-section">
        <div className="tw-segs" role="group" aria-labelledby="tweaks-led-label">
          <span id="tweaks-led-label" style={{ position: "absolute", left: "-9999px" }}>
            Pad LED Color
          </span>
          <span className="tw-segs-label">Pad LED Color</span>
          {LED_COLOR_NAMES.map((color) => (
            <button
              key={color}
              type="button"
              className={`tw-seg${ledColor === color ? " on" : ""}`}
              aria-pressed={ledColor === color}
              onClick={() => handleLedClick(color)}
            >
              {color}
            </button>
          ))}
        </div>
      </div>

      {/* Master Volume */}
      <div className="tw-section">
        <label htmlFor="tweaks-master">Master Volume</label>
        <div className="tw-row">
          <input
            id="tweaks-master"
            type="range"
            min={-40}
            max={6}
            step={1}
            value={masterDb}
            onChange={handleMasterChange}
            aria-label="Master volume in dB"
            aria-valuetext={`${masterDb} dB`}
          />
          <span
            style={{
              width: "48px",
              textAlign: "right",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "12px",
            }}
          >
            {masterDb}dB
          </span>
        </div>
      </div>

      {/* Tempo */}
      <div className="tw-section">
        <label htmlFor="tweaks-bpm">Tempo (BPM)</label>
        <div className="tw-row">
          <input
            id="tweaks-bpm"
            type="range"
            min={60}
            max={180}
            step={1}
            value={bpm}
            onChange={handleBpmChange}
            aria-label="Tempo in BPM"
            aria-valuetext={`${bpm} BPM`}
          />
          <span
            style={{
              width: "48px",
              textAlign: "right",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "12px",
            }}
          >
            {bpm}
          </span>
        </div>
      </div>

      {/* Export dialog position */}
      <div className="tw-section">
        <div className="tw-segs" role="group" aria-labelledby="tweaks-dialog-pos-label">
          <span id="tweaks-dialog-pos-label" style={{ position: "absolute", left: "-9999px" }}>
            Export dialog position
          </span>
          <span className="tw-segs-label">Export dialog position</span>
          {(
            [
              { value: "center", label: "Center" },
              { value: "top-right", label: "Top-right" },
              { value: "bottom-right", label: "Bottom-right" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`tw-seg${dialogPosition === value ? " on" : ""}`}
              aria-pressed={dialogPosition === value}
              onClick={() => setDialogPosition(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* After export */}
      <div className="tw-section">
        <div className="tw-segs" role="group" aria-labelledby="tweaks-after-export-label">
          <span id="tweaks-after-export-label" style={{ position: "absolute", left: "-9999px" }}>
            After export
          </span>
          <span className="tw-segs-label">After export</span>
          <button
            type="button"
            className={`tw-seg${autoOpenExportFolder ? " on" : ""}`}
            aria-pressed={autoOpenExportFolder}
            onClick={() => setAutoOpenExportFolder(!autoOpenExportFolder)}
          >
            Open folder
          </button>
          <button
            type="button"
            className={`tw-seg${unmountAfterExport ? " on" : ""}`}
            aria-pressed={unmountAfterExport}
            onClick={() => setUnmountAfterExport(!unmountAfterExport)}
          >
            Unmount
          </button>
        </div>
      </div>

      {/* MIDI Device */}
      <div className="tw-section">
        <label htmlFor="tweaks-midi-device">MIDI Device</label>
        {midiStatus === "unsupported" ? (
          <span className="tw-hint">Web MIDI not supported in this browser</span>
        ) : midiStatus === "denied" ? (
          <span className="tw-hint">MIDI access denied</span>
        ) : midiStatus === "idle" || midiStatus === "searching" ? (
          <span className="tw-hint">Start the app to detect MIDI devices</span>
        ) : midiInputs.length === 0 ? (
          <span className="tw-hint">No MIDI devices connected</span>
        ) : (
          <select
            id="tweaks-midi-device"
            value={preferredMidiDeviceName ?? ""}
            onChange={(e) =>
              setPreferredMidiDeviceName(e.target.value === "" ? null : e.target.value)
            }
            aria-label="Select MIDI input device"
          >
            <option value="">Auto (first device)</option>
            {midiInputs.map((inp) => (
              <option key={inp.id} value={inp.name}>
                {inp.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
