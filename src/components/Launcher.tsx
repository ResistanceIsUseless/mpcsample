/**
 * Launcher.tsx — Full-screen startup modal for the Electron desktop app.
 *
 * Shown once at startup when `isDesktop()` is true and no kit has been chosen.
 * Dismissed when the user picks a kit (either loaded or blank).
 *
 * Accessibility:
 *  - role="dialog", aria-modal, aria-labelledby on the dialog container
 *  - Focus trap: Tab cycles within the dialog; Shift+Tab wraps backwards
 *  - Escape: closes to "New Kit" (calls `onNewKit`) — documented below
 *  - Error state: role="alert" for screen reader announcements
 *  - Focus management: primary button receives focus when dialog mounts;
 *    focus stays inside the dialog throughout
 *
 * Escape key behaviour:
 *  Pressing Escape is treated as "New Kit" — i.e. the dialog is dismissed
 *  immediately with an empty kit rather than blocking the user. This is
 *  intentional: there is no "cancel without choice" in the launcher because
 *  the rest of the app requires some kit state to function correctly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { desktop } from "../desktop/bridge";
import { loadBlankKit, loadProjectFromDir } from "../desktop/loadProject";
import "../styles/launcher.css";

const FOCUSABLE_SELECTORS =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
}

type LauncherProps = {
  /** Called when the user has made a kit choice and the dialog should close. */
  onDismiss: () => void;
};

export function Launcher({ onDismiss }: LauncherProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the primary ("Load existing") button when the dialog mounts.
  useEffect(() => {
    const id = setTimeout(() => primaryBtnRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  const handleNewKit = useCallback(() => {
    loadBlankKit();
    onDismiss();
  }, [onDismiss]);

  const handleLoad = useCallback(async () => {
    setError(null);
    let dir: string | null = null;

    try {
      dir = await desktop().chooseProjectDir();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open the file picker.");
      return;
    }

    // User cancelled the picker — stay on the launcher.
    if (dir === null) return;

    setLoading(true);
    try {
      await loadProjectFromDir(dir);
      onDismiss();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load the project. Make sure the selected .xpj file is valid.",
      );
    } finally {
      setLoading(false);
    }
  }, [onDismiss]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Escape → New Kit (documented: keeps the app in a valid state).
      if (e.key === "Escape") {
        e.stopPropagation();
        handleNewKit();
        return;
      }

      if (e.key === "Tab") {
        const container = dialogRef.current;
        if (!container) return;
        const focusable = getFocusable(container);
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
    [handleNewKit],
  );

  return (
    <div className="launcher-overlay">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launcher-heading"
        className="launcher-dialog"
        onKeyDown={handleKeyDown}
        // Prevent clicks on the dialog from bubbling to the overlay.
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="launcher-heading" className="launcher-heading">
            MPC Sample
          </h2>
          <p className="launcher-subhead">Choose how to start</p>
        </div>

        {/* Error announcement */}
        {error && (
          <p className="launcher-error" role="alert">
            {error}
          </p>
        )}

        {/* Loading state */}
        {loading && (
          <div className="launcher-loading" aria-live="polite" aria-atomic="true">
            <span className="launcher-spinner" aria-hidden="true" />
            Loading project…
          </div>
        )}

        {/* Action buttons */}
        <div className="launcher-actions">
          <button
            ref={primaryBtnRef}
            type="button"
            className="launcher-action-btn primary"
            onClick={handleLoad}
            disabled={loading}
            aria-label="Load an existing Akai .xpj project file"
          >
            <span className="launcher-btn-label">Load existing project</span>
            <span className="launcher-btn-hint">Open an Akai .xpj project file</span>
          </button>

          <button
            type="button"
            className="launcher-action-btn"
            onClick={handleNewKit}
            disabled={loading}
            aria-label="Start a new blank kit"
          >
            <span className="launcher-btn-label">New kit</span>
            <span className="launcher-btn-hint">
              Start with an empty kit — drag WAV files onto pads
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
