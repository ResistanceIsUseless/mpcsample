import { useState } from "react";
import "../styles/controls.css";
import { useMPCStore } from "../state/store";

type ToggleState = {
  sample: boolean;
  seq: boolean;
  padFx: boolean;
  knobFx: boolean;
  shift: boolean;
};

export function ModeButtons() {
  const cycleBank = useMPCStore((s) => s.cycleBank);
  const [toggles, setToggles] = useState<ToggleState>({
    sample: false,
    seq: false,
    padFx: false,
    knobFx: false,
    shift: false,
  });

  function toggle(key: keyof ToggleState) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <>
      <div className="mode-block">
        <div className="lbl-row">MODE</div>
        <div className="btn-stack">
          <button
            type="button"
            className={`btn${toggles.sample ? " is-on" : ""}`}
            aria-pressed={toggles.sample}
            onClick={() => toggle("sample")}
          >
            SAMPLE
          </button>
          <div className="lbl">INPUT CONFIG</div>
        </div>
        <div className="btn-stack">
          <button
            type="button"
            className={`btn${toggles.seq ? " is-on" : ""}`}
            aria-pressed={toggles.seq}
            onClick={() => toggle("seq")}
          >
            SEQ
            <br />
            STEP EDIT
          </button>
          <div className="lbl">FLEX BEAT</div>
        </div>
        <div className="btn-stack">
          <button
            type="button"
            className={`btn orange${toggles.padFx ? " is-on" : ""}`}
            aria-pressed={toggles.padFx}
            onClick={() => toggle("padFx")}
          >
            PAD
            <br />
            FX
          </button>
          <div className="lbl">FLEX BEAT</div>
        </div>
        <div className="btn-stack">
          <button
            type="button"
            className={`btn orange${toggles.knobFx ? " is-on" : ""}`}
            aria-pressed={toggles.knobFx}
            onClick={() => toggle("knobFx")}
          >
            KNOB
            <br />
            FX
          </button>
          <div className="lbl">FX SELECT</div>
        </div>
      </div>

      <div className="shift-row">
        <div className="btn-stack">
          <button
            type="button"
            className={`btn square${toggles.shift ? " is-on" : ""}`}
            aria-pressed={toggles.shift}
            onClick={() => toggle("shift")}
          >
            SHIFT
          </button>
        </div>
        <div className="btn-stack">
          <button
            type="button"
            className="btn square"
            aria-label="Cycle pad bank"
            onClick={cycleBank}
          >
            PAD
            <br />
            BANK
          </button>
        </div>
      </div>
    </>
  );
}
