import { localToGlobal, PAD_LAYOUT } from "../data/padLayout";
import { useMPCStore } from "../state/store";
import { Pad } from "./Pad";

const ROW_LABELS = ["13 · 14 · 15 · 16", "9 · 10 · 11 · 12", "5 · 6 · 7 · 8", "1 · 2 · 3 · 4"];

export function PadGrid() {
  const bankIdx = useMPCStore((s) => s.bankIdx);
  const padMap = useMPCStore((s) => s.padMap);
  const loadingPads = useMPCStore((s) => s.loadingPads);

  return (
    <div className="pad-frame">
      <div className="pad-grid">
        {PAD_LAYOUT.flat().map((padDef) => {
          const globalIdx = localToGlobal(bankIdx, padDef.idx);
          const sample = padMap[globalIdx] ?? null;
          const loading = loadingPads[globalIdx] ?? false;
          return (
            <Pad
              key={padDef.idx}
              definition={padDef}
              globalIdx={globalIdx}
              sample={sample}
              loading={loading}
            />
          );
        })}
      </div>
      <div className="pad-bottom-row">
        {ROW_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}
