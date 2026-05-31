import { useCallback, useState } from "react";
import "../styles/controls.css";

export function Transport() {
  const [playPressed, setPlayPressed] = useState(false);
  const [stopPressed, setStopPressed] = useState(false);

  const handlePlay = useCallback(() => {
    setPlayPressed(true);
    setStopPressed(false);
    window.dispatchEvent(new CustomEvent("mpc:transport-play"));
  }, []);

  const handleStop = useCallback(() => {
    setStopPressed(true);
    setPlayPressed(false);
    window.dispatchEvent(new CustomEvent("mpc:transport-stop"));
  }, []);

  return (
    <div className="transport">
      <div className="btn-stack">
        <button
          type="button"
          className={`btn stop-btn${stopPressed ? " is-on" : ""}`}
          aria-label="Stop"
          onClick={handleStop}
        />
      </div>
      <div className="btn-stack">
        <button
          type="button"
          className={`btn play-btn${playPressed ? " is-on" : ""}`}
          aria-label="Play"
          onClick={handlePlay}
        />
        <div className="lbl">CONTINUE</div>
      </div>
    </div>
  );
}
