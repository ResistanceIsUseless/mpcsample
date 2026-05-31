import { useCallback } from "react";
import { BANK_LABELS } from "../data/padLayout";
import { useMPCStore } from "../state/store";

/**
 * Segmented bank selector showing A–D always, E–H only when `maxBank >= 4`.
 *
 * Accessibility:
 * - `role="group"` / `aria-label="Pad bank"` wraps all buttons.
 * - Each button has an `aria-label` of "Bank A" etc.
 * - Active bank button has `aria-pressed={true}`.
 * - Full keyboard support via Tab/Enter/Space (native button behaviour).
 * - Arrow-key navigation cycles within the visible bank set.
 */
export function BankSelector() {
  const bankIdx = useMPCStore((s) => s.bankIdx);
  const setBank = useMPCStore((s) => s.setBank);

  // Always show all 8 banks (A–H) so the user can navigate to any bank.
  const visibleCount = 8;

  const handleClick = useCallback(
    (idx: number) => {
      setBank(idx);
    },
    [setBank],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(bankIdx + 1, visibleCount - 1);
        setBank(next);
        // Move DOM focus to the newly active button.
        const group = e.currentTarget;
        const buttons = group.querySelectorAll<HTMLButtonElement>("button");
        buttons[next]?.focus();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(bankIdx - 1, 0);
        setBank(prev);
        const group = e.currentTarget;
        const buttons = group.querySelectorAll<HTMLButtonElement>("button");
        buttons[prev]?.focus();
      }
    },
    [bankIdx, setBank],
  );

  return (
    <div role="group" aria-label="Pad bank" className="bank-selector" onKeyDown={handleKeyDown}>
      <span className="lbl bank-selector-label">Bank</span>
      <div className="bank-selector-btns tw-segs">
        {BANK_LABELS.slice(0, visibleCount).map((label, idx) => {
          const isActive = idx === bankIdx;
          return (
            <button
              key={label}
              type="button"
              className={`tw-seg bank-btn${isActive ? " on" : ""}`}
              aria-label={`Bank ${label}`}
              aria-pressed={isActive}
              onClick={() => handleClick(idx)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
