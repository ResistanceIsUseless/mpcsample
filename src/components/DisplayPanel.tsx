import type { AudioEngineLike } from "../types/mpc.types";
import { Knob } from "./Knob";
import { Screen } from "./Screen";

type DisplayPanelProps = {
  engine: AudioEngineLike | null;
};

export function DisplayPanel({ engine }: DisplayPanelProps) {
  return (
    <div className="display-panel">
      {/* Logo area */}
      <div className="logo-area">
        <div className="akai-mark">
          AKAI<span className="pro">professional</span>
        </div>
        <div className="mpc-mark">MPC</div>
      </div>

      {/* Top utility buttons */}
      <div className="top-utils">
        <button type="button" className="top-util-btn" aria-label="Utility 1" />
        <button type="button" className="top-util-btn" aria-label="Utility 2" />
        <button type="button" className="top-util-btn" aria-label="Utility 3" />
      </div>

      {/* Main volume knob */}
      <div className="main-vol-wrap">
        <Knob name="mainVol" label="MAIN VOL" size="lg" />
        <div className="main-vol-label">MAIN VOLUME</div>
      </div>

      {/* Screen */}
      <Screen engine={engine} />

      {/* Speaker grille */}
      <div className="speaker" aria-hidden="true" />

      {/* Decorative banners */}
      <div className="mpc-banner" aria-hidden="true">
        MPC SAMPLE
      </div>
      <div className="mpc-banner-left" aria-hidden="true">
        MPC SAMPLE · MPC SAMPLE
      </div>
    </div>
  );
}
