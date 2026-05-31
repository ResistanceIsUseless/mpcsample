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
  const startBtnRef = useRef<HTMLButtonElement | null>(null);
  const headingId = "start-overlay-heading";

  // Focus the start button on mount
  useEffect(() => {
    if (!isStarted) {
      startBtnRef.current?.focus();
    }
  }, [isStarted]);

  // Focus trap: cycle Tab within the card
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      // Only the start button is focusable; keep focus on it
      e.preventDefault();
      startBtnRef.current?.focus();
    }
    if (e.key === "Escape") {
      // Do nothing — overlay must be dismissed via START button
    }
  }, []);

  const handleStart = useCallback(async () => {
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
  }, [isLoading, onStart, setStarted]);

  if (isStarted) return null;

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
        <p>
          Click START to enable audio. Use <b>1234 / QWER / ASDF / ZXCV</b> to play pads. Web MIDI
          input is auto-detected.
        </p>
        <button
          ref={startBtnRef}
          type="button"
          onClick={handleStart}
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? "STARTING…" : "START"}
        </button>
      </div>
    </div>
  );
}
