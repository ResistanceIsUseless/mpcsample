import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { isDesktop } from "./desktop/bridge";
import "./styles/tokens.css";
import "./styles/global.css";

// Electron: scale the MPC viewport to fill the window while keeping the
// hardware-accurate aspect ratio. Must run before React mounts so the CSS
// class and custom property are in place for the first paint.
if (isDesktop()) {
  document.body.classList.add("is-electron");
  const BASE_W = 920;
  const BASE_H = 960;
  const updateScale = () => {
    const s = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    document.documentElement.style.setProperty("--mpc-scale", String(s));
  };
  updateScale();
  window.addEventListener("resize", updateScale);
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
