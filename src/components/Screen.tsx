import { BANK_LABELS } from "../data/padLayout";
import { useMPCStore } from "../state/store";
import type { AudioEngineLike } from "../types/mpc.types";
import { Waveform } from "./Waveform";

type ScreenProps = {
  engine: AudioEngineLike | null;
};

export function Screen({ engine }: ScreenProps) {
  const bpm = useMPCStore((s) => s.bpm);
  const bankIdx = useMPCStore((s) => s.bankIdx);
  const activeKit = useMPCStore((s) => s.activeKit);
  const lastTriggeredPad = useMPCStore((s) => s.lastTriggeredPad);
  const padMap = useMPCStore((s) => s.padMap);

  const padBankIdx = lastTriggeredPad !== null ? lastTriggeredPad >> 4 : bankIdx;
  const padLocalNum = lastTriggeredPad !== null ? (lastTriggeredPad & 0xf) + 1 : 1;
  const bankBadge = `${BANK_LABELS[padBankIdx] ?? "A"}${String(padLocalNum).padStart(2, "0")}`;
  const kitLabel = activeKit?.displayName ?? "—";

  const triggeredPad = lastTriggeredPad !== null ? padMap[lastTriggeredPad] : null;
  const sampleName = triggeredPad ? triggeredPad.sampleName.replace(/\.wav$/i, "") : "—";

  return (
    <div className="screen">
      <div className="screen-inner">
        {/* Top row: BPM + kit name */}
        <div className="scr-row top">
          <div>
            <span className="scr-bpm">{bpm}</span> BPM
          </div>
          <div className="scr-tag">
            <span className="sr-only">Active kit: </span>
            {kitLabel}
          </div>
          <div className="scr-tag">Filter</div>
        </div>

        {/* Sample row */}
        <div className="scr-row">
          <div className="scr-sample">
            <span className="badge">{bankBadge}</span>
            <span>{sampleName}</span>
          </div>
          <div className="scr-pads">
            {BANK_LABELS.map((letter, i) => (
              <div key={letter} className={`sp${i === bankIdx ? " on" : ""}`}>
                {letter}
              </div>
            ))}
          </div>
        </div>

        {/* Waveform */}
        <Waveform engine={engine} />

        {/* Footer tabs */}
        <div className="scr-foot">
          <div>Start</div>
          <div>End</div>
          <div className="active">Loop</div>
        </div>
      </div>
    </div>
  );
}
