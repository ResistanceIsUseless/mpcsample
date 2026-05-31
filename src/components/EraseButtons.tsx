import "../styles/controls.css";

export function EraseButtons() {
  return (
    <div className="erase-row">
      <div className="btn-stack">
        <button type="button" className="btn square" aria-label="Erase">
          ERASE
        </button>
        <div className="lbl">COPY</div>
      </div>
      <div className="btn-stack">
        <button type="button" className="btn square" aria-label="Note repeat">
          NOTE
          <br />
          RPT
        </button>
        <div className="lbl">TRIPLET</div>
      </div>
    </div>
  );
}
