import { useCallback, useEffect, useRef, useState } from "react";
import { useMPCStore } from "../state/store";

type StartOverlayProps = {
  onStart: () => Promise<void>;
};

export function StartOverlay({ onStart }: StartOverlayProps) {
  const isStarted = useMPCStore((s) => s.isStarted);
  const setStarted = useMPCStore((s) => s.setStarted);
  const [isHiding, setIsHiding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const startBtnRef = useRef<HTMLButtonElement | null>(null);
  const headingId = "start-overlay-heading";

  // Listen for help re-open requests from the HUD
  useEffect(() => {
    const handler = () => {
      setIsHiding(false);
      setIsHelpOpen(true);
    };
    window.addEventListener("mpc:open-help", handler);
    return () => window.removeEventListener("mpc:open-help", handler);
  }, []);

  // Focus the start button on mount or when help opens
  useEffect(() => {
    if (!isStarted || isHelpOpen) {
      startBtnRef.current?.focus();
    }
  }, [isStarted, isHelpOpen]);

  // Focus trap: cycle Tab within the card
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Tab") {
        // Only the start button is focusable; keep focus on it
        e.preventDefault();
        startBtnRef.current?.focus();
      }
      if (e.key === "Escape") {
        // Do nothing — overlay must be dismissed via START button
      }
    },
    [],
  );

  const handleStart = useCallback(async () => {
    if (isHelpOpen) {
      setIsHiding(true);
      setTimeout(() => setIsHelpOpen(false), 220);
      return;
    }
    if (isLoading) return;
    setIsLoading(true);
    try {
      await onStart();
      setIsHiding(true);
      // Small delay to allow CSS transition before removing from DOM
      setTimeout(() => {
        setStarted(true);
      }, 220);
    } catch (err) {
      console.error("Failed to start audio:", err);
      setIsLoading(false);
    }
  }, [isHelpOpen, isLoading, onStart, setStarted]);

  if (isStarted && !isHelpOpen) return null;

  return (
    <div
      className={`start-overlay${isHiding ? " hide" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onKeyDown={handleKeyDown}
    >
      <div className="start-card">
        <h2 id={headingId}>MPC SAMPLE</h2>
        <ul className="start-guide">
          <li>
            <b>Play</b> — click pads or use keys{" "}
            <b>1234 / QWER / ASDF / ZXCV</b>.
          </li>
          <li>
            <b>Web MIDI</b> — connect your MPC Sample directly with Web MIDI
            &nbsp;
            <i>(make sure to allow midi access in your browser settings).</i>
          </li>
          <li>
            <b>Load samples</b> — drag &amp; drop audio files directly onto any
            pad.
          </li>
          <li>
            <b>Tweaks</b> - click on the tweaks button to adjust the volume,
            tempo, and more.
          </li>
          <li>
            <b>Swap pads</b> — drag one pad onto another to swap their samples.
          </li>
          <li>
            <b>Banks A–H</b> — use <b>Edit Kit</b> to manage pads across all 8
            banks (128 pads total).
          </li>
          <li>
            <b>Tweak</b> — click a pad's name or use the inspector panel to
            adjust volume, pitch, and tune.
          </li>
          <li>
            <b>Export</b> — click <b>Export</b> to save a <code>.xpj</code>{" "}
            project file ready for your MPC hardware.
          </li>
          <li>
            <b>Open Source</b> - Free and open source under the GPL-3.0 license
            more info{" "}
            <a
              href="https://github.com/WorldLinkStudio/mpcsample"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500"
            >
              here
            </a>
            .
          </li>
        </ul>
        <button
          ref={startBtnRef}
          type="button"
          onClick={handleStart}
          disabled={!isHelpOpen && isLoading}
          aria-busy={isLoading}
        >
          {isHelpOpen ? "CLOSE" : isLoading ? "STARTING…" : "START"}
        </button>
      </div>
    </div>
  );
}
