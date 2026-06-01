import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const k1 = useMPCStore((s) => s.knobs.k1);
  const k2 = useMPCStore((s) => s.knobs.k2);
  const setPadTrim = useMPCStore((s) => s.setPadTrim);
  const setKnob = useMPCStore((s) => s.setKnob);
  const _loadingPads = useMPCStore((s) => s.loadingPads);

  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(1);
  const handleViewChange = useCallback((start: number, end: number) => {
    setViewStart(start);
    setViewEnd(end);
  }, []);

  const padBankIdx = lastTriggeredPad !== null ? lastTriggeredPad >> 4 : bankIdx;
  const padLocalNum = lastTriggeredPad !== null ? (lastTriggeredPad & 0xf) + 1 : 1;
  const bankBadge = `${BANK_LABELS[padBankIdx] ?? "A"}${String(padLocalNum).padStart(2, "0")}`;
  const kitLabel = activeKit?.displayName ?? "—";

  const triggeredPad = lastTriggeredPad !== null ? padMap[lastTriggeredPad] : null;
  const sampleName = triggeredPad ? triggeredPad.sampleName.replace(/\.wav$/i, "") : "—";

  // Frame count for the currently displayed pad's buffer
  const frameCount = useMemo(() => {
    void _loadingPads;
    if (!engine || lastTriggeredPad === null) return 0;
    return engine.getPadChannelData?.(lastTriggeredPad)?.length ?? 0;
  }, [engine, lastTriggeredPad, _loadingPads]);

  // When the active pad or its buffer changes, push the pad's trim data into the knobs.
  // knobSyncRef prevents the resulting k1/k2 change from immediately writing back to the store.
  const knobSyncRef = useRef<"pad" | "user">("user");
  useEffect(() => {
    if (lastTriggeredPad === null || frameCount <= 0) return;
    const pad = padMap[lastTriggeredPad];
    const startFrac = (pad?.sampleStart ?? 0) / frameCount;
    const endFrac = (pad?.sampleEnd ?? frameCount) / frameCount;
    knobSyncRef.current = "pad";
    setKnob("k1", Math.max(0, Math.min(1, startFrac)));
    setKnob("k2", Math.max(0, Math.min(1, endFrac)));
  }, [lastTriggeredPad, frameCount, setKnob, padMap]);

  // When k1/k2 change, write the new trim to the store — unless we just synced from the pad.
  useEffect(() => {
    if (knobSyncRef.current === "pad") {
      knobSyncRef.current = "user";
      return;
    }
    if (lastTriggeredPad === null || frameCount <= 0) return;
    const pad = padMap[lastTriggeredPad];
    const startFrame = Math.round(k1 * frameCount);
    const endFrame = Math.round(k2 * frameCount);
    // Skip if values already match what's stored (avoids redundant engine calls)
    if (startFrame === (pad?.sampleStart ?? 0) && endFrame === (pad?.sampleEnd ?? frameCount)) {
      return;
    }
    if (startFrame < endFrame) {
      setPadTrim(lastTriggeredPad, startFrame, endFrame);
    }
  }, [k1, k2, lastTriggeredPad, frameCount, padMap, setPadTrim]);

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
        <Waveform
          engine={engine}
          viewStart={viewStart}
          viewEnd={viewEnd}
          onViewChange={handleViewChange}
        />

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
