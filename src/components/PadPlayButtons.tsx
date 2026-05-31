import { useState } from "react";
import "../styles/controls.css";

type ToggleState = {
  chop: boolean;
  mute: boolean;
  loop: boolean;
  levels: boolean;
};

export function PadPlayButtons() {
  const [toggles, setToggles] = useState<ToggleState>({
    chop: false,
    mute: false,
    loop: false,
    levels: false,
  });

  function toggle(key: keyof ToggleState) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="pad-play-block">
      <div className="lbl-row">PAD PLAY</div>
      <div className="btn-stack">
        <button
          type="button"
          className={`btn cyan${toggles.chop ? " is-on" : ""}`}
          aria-pressed={toggles.chop}
          onClick={() => toggle("chop")}
        >
          CHOP
        </button>
        <div className="lbl">NOTE ON</div>
      </div>
      <div className="btn-stack">
        <button
          type="button"
          className={`btn cyan${toggles.mute ? " is-on" : ""}`}
          aria-pressed={toggles.mute}
          onClick={() => toggle("mute")}
        >
          MUTE
        </button>
        <div className="lbl">UNMUTE ALL</div>
      </div>
      <div className="btn-stack">
        <button
          type="button"
          className={`btn cyan${toggles.loop ? " is-on" : ""}`}
          aria-pressed={toggles.loop}
          onClick={() => toggle("loop")}
        >
          LOOP
        </button>
        <div className="lbl">REVERSE</div>
      </div>
      <div className="btn-stack">
        <button
          type="button"
          className={`btn cyan${toggles.levels ? " is-on" : ""}`}
          aria-pressed={toggles.levels}
          onClick={() => toggle("levels")}
        >
          16
          <br />
          LEVELS
        </button>
        <div className="lbl">TYPE</div>
      </div>
    </div>
  );
}
