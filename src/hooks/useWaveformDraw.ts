import type React from "react";
import { useEffect } from "react";

/**
 * Drives a canvas visualizer from a buffer-providing callback.
 *
 * Supports three modes:
 * - `"waveform"` (default): static min/max envelope of a decoded sample buffer.
 *   Redraws only when the buffer reference changes — CPU-free when idle.
 * - `"fft"` (frequency-domain): dB magnitude bars, log-spaced, with peak hold.
 * - `"oscilloscope"` (time-domain): live signed-float center-zero line plot.
 *
 * Memory / CPU hygiene:
 * - rAF loop pauses when the document is hidden (Page Visibility API).
 * - "waveform" mode skips the draw entirely when the buffer reference is unchanged.
 * - Cancels rAF + removes listeners on unmount.
 */
export function useWaveformDraw(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  getBuffer: (() => Float32Array | null) | null,
  mode: "waveform" | "fft" | "oscilloscope" = "waveform",
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number | null = null;
    let stopped = false;
    // Peak hold state for FFT mode
    let peaks: Float32Array | null = null;
    // Cache for waveform mode — skip redraw when reference unchanged
    let lastWaveformBuf: Float32Array | null = null;

    function resizeCanvas(): void {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
    }

    function drawFrame(): void {
      if (stopped) return;
      const c = canvasRef.current;
      if (!c || !ctx) {
        rafId = requestAnimationFrame(drawFrame);
        return;
      }
      const w = c.width;
      const h = c.height;

      if (mode === "waveform") {
        const buf = getBuffer ? getBuffer() : null;

        // Skip redraw — and crucially skip clearRect — when the buffer is
        // unchanged or when the new pad's buffer is still loading (null).
        // This keeps the previous waveform visible instead of flashing to blank.
        if (lastWaveformBuf !== null && (buf === lastWaveformBuf || buf === null)) {
          rafId = requestAnimationFrame(drawFrame);
          return;
        }
        lastWaveformBuf = buf;

        ctx.clearRect(0, 0, w, h);

        // Subtle grid
        const GRID_COLS = 8;
        const GRID_ROWS = 4;
        ctx.strokeStyle = "rgba(255,210,0,0.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gi = 1; gi < GRID_COLS; gi++) {
          const gx = Math.round((gi / GRID_COLS) * w) + 0.5;
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, h);
        }
        for (let gi = 1; gi < GRID_ROWS; gi++) {
          const gy = Math.round((gi / GRID_ROWS) * h) + 0.5;
          ctx.moveTo(0, gy);
          ctx.lineTo(w, gy);
        }
        ctx.stroke();

        // Center line slightly brighter
        ctx.strokeStyle = "rgba(255,210,0,0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2 + 0.5);
        ctx.lineTo(w, h / 2 + 0.5);
        ctx.stroke();

        // Border
        ctx.strokeStyle = "rgba(255,210,0,0.28)";
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

        if (buf && buf.length > 0) {
          const N = buf.length;
          const cy = h / 2;
          const SCALE = 0.86;

          ctx.fillStyle = "#ffd200";

          for (let x = 0; x < w; x++) {
            // Map column → sample range (even a 1-sample slice still paints)
            const sStart = Math.floor((x / w) * N);
            const sEnd = Math.max(sStart + 1, Math.floor(((x + 1) / w) * N));

            let minS = 0;
            let maxS = 0;
            for (let s = sStart; s < sEnd && s < N; s++) {
              const v = buf[s];
              if (v < minS) minS = v;
              if (v > maxS) maxS = v;
            }

            const yTop = Math.round(cy - maxS * cy * SCALE);
            const yBot = Math.round(cy - minS * cy * SCALE);
            ctx.fillRect(x, yTop, 1, Math.max(1, yBot - yTop));
          }
        } else {
          // No sample loaded — draw a flat center line
          ctx.fillStyle = "rgba(255,210,0,0.25)";
          ctx.fillRect(0, Math.round(h / 2), w, 1);
        }

        rafId = requestAnimationFrame(drawFrame);
        return;
      }

      // Live modes (fft, oscilloscope) clear every frame
      const buf = getBuffer ? getBuffer() : null;
      ctx.clearRect(0, 0, w, h);

      if (mode === "fft") {
        // Bottom baseline
        ctx.strokeStyle = "rgba(0,200,180,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h - 1);
        ctx.lineTo(w, h - 1);
        ctx.stroke();

        if (buf && buf.length > 0) {
          const BAR_COUNT = 96;
          const binCount = buf.length;
          const gap = 1;
          const barW = Math.max(1, Math.floor(w / BAR_COUNT) - gap);

          // Init or resize peak hold array
          if (!peaks || peaks.length !== BAR_COUNT) {
            peaks = new Float32Array(BAR_COUNT);
          }

          const PEAK_DECAY = 0.008;
          const DB_FLOOR = -90;
          // Full usable bin range: skip DC (0), go to Nyquist (binCount - 1)
          const minFreqBin = 1;
          const maxFreqBin = binCount - 1;

          // One gradient for all bars (top = bright cyan, bottom = dark teal)
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, "rgba(0,229,200,0.95)");
          grad.addColorStop(0.45, "rgba(0,180,158,0.80)");
          grad.addColorStop(1, "rgba(0,80,72,0.55)");

          ctx.fillStyle = grad;

          for (let i = 0; i < BAR_COUNT; i++) {
            const t0 = i / BAR_COUNT;
            const t1 = (i + 1) / BAR_COUNT;
            const binStart = Math.max(
              minFreqBin,
              Math.round(minFreqBin * (maxFreqBin / minFreqBin) ** t0),
            );
            const binEnd = Math.max(
              binStart + 1,
              Math.round(minFreqBin * (maxFreqBin / minFreqBin) ** t1),
            );

            let sum = 0;
            let count = 0;
            for (let b = binStart; b < binEnd && b < binCount; b++) {
              const db = buf[b];
              sum += Number.isFinite(db) ? db : DB_FLOOR;
              count++;
            }
            const avgDb = count > 0 ? sum / count : DB_FLOOR;
            const norm = Math.max(0, Math.min(1, (avgDb - DB_FLOOR) / -DB_FLOOR));
            const barH = Math.max(1, norm * h * 0.96);
            const x = i * (barW + gap);

            // Bar fill
            ctx.fillRect(x, h - barH, barW, barH);

            // Peak hold: rise instantly, decay slowly
            if (norm > peaks[i]) {
              peaks[i] = norm;
            } else {
              peaks[i] = Math.max(0, peaks[i] - PEAK_DECAY);
            }

            // Peak dot
            if (peaks[i] > 0.01) {
              const peakY = h - Math.round(peaks[i] * h * 0.96);
              ctx.fillStyle = "rgba(180,255,240,0.9)";
              ctx.fillRect(x, peakY - 1, barW, 2);
              ctx.fillStyle = grad;
            }
          }
        }
      } else {
        // Center grid line
        ctx.strokeStyle = "rgba(108,184,168,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        if (buf && buf.length > 0) {
          const dpr = window.devicePixelRatio || 1;
          ctx.strokeStyle = "#d6f24a";
          ctx.lineWidth = 1.2 * dpr;
          ctx.shadowColor = "#d6f24a";
          ctx.shadowBlur = 6;
          ctx.beginPath();
          for (let i = 0; i < buf.length; i++) {
            const x = (i / buf.length) * w;
            const y = h / 2 + buf[i] * h * 0.45;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      rafId = requestAnimationFrame(drawFrame);
    }

    function startLoop(): void {
      if (rafId !== null) return;
      stopped = false;
      rafId = requestAnimationFrame(drawFrame);
    }

    function stopLoop(): void {
      stopped = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function handleVisibilityChange(): void {
      if (document.hidden) stopLoop();
      else startLoop();
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!document.hidden) startLoop();

    return () => {
      stopLoop();
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canvasRef, getBuffer, mode]);
}
