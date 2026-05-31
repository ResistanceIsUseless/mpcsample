import type { GlobalPadIdx } from "../kits/kit.types";
import type { PadDefinition, PadIndex } from "../types/mpc.types";

export const TOTAL_BANKS = 8;
export const PADS_PER_BANK = 16;
export const TOTAL_PADS_GLOBAL = TOTAL_BANKS * PADS_PER_BANK; // 128

/** Human-readable bank labels A–H */
export const BANK_LABELS: ReadonlyArray<string> = ["A", "B", "C", "D", "E", "F", "G", "H"];

/**
 * Convert a bank index + local pad index to a global pad index.
 *
 * @param bankIdx  0..7  (0=A … 7=H)
 * @param localIdx 0..15 (position within the bank)
 * @returns GlobalPadIdx 0..127
 */
export function localToGlobal(bankIdx: number, localIdx: number): GlobalPadIdx {
  return bankIdx * PADS_PER_BANK + localIdx;
}

/**
 * Extract the local pad index (0..15) from a global pad index.
 *
 * @param globalIdx 0..127
 * @returns localIdx 0..15
 */
export function globalToLocal(globalIdx: GlobalPadIdx): number {
  return globalIdx & 0xf;
}

/**
 * Extract the bank index (0..7) from a global pad index.
 *
 * @param globalIdx 0..127
 * @returns bankIdx 0..7
 */
export function globalToBank(globalIdx: GlobalPadIdx): number {
  return globalIdx >> 4;
}

/**
 * Local (within-bank) 4×4 pad layout definitions.
 * `idx` values are LOCAL (0..15) — convert to GlobalPadIdx at render time
 * via `localToGlobal(bankIdx, def.idx)`.
 */
export const PAD_LAYOUT: ReadonlyArray<ReadonlyArray<PadDefinition>> = [
  [
    { idx: 12, num: 13, label: "TRIM SAMPLE", key: "1" },
    { idx: 13, num: 14, label: "TIME CORRECT", key: "2" },
    { idx: 14, num: 15, label: "WARP", key: "3" },
    { idx: 15, num: 16, label: "PROJECT", key: "4" },
  ],
  [
    { idx: 8, num: 9, label: "FADER", key: "q" },
    { idx: 9, num: 10, label: "REC QUANTIZE", key: "w" },
    { idx: 10, num: 11, label: "RESAMPLE", key: "e" },
    { idx: 11, num: 12, label: "SONG", key: "r" },
  ],
  [
    { idx: 4, num: 5, label: "COMPRESSOR", key: "a" },
    { idx: 5, num: 6, label: "HALF SPEED", key: "s" },
    { idx: 6, num: 7, label: "DOUBLE SPEED", key: "d" },
    { idx: 7, num: 8, label: "MIDI CONFIG", key: "f" },
  ],
  [
    { idx: 0, num: 1, label: "FULL LEVEL", key: "z" },
    { idx: 1, num: 2, label: "HALF SEQ", key: "x" },
    { idx: 2, num: 3, label: "DOUBLE SEQ", key: "c" },
    { idx: 3, num: 4, label: "COUNT-IN", key: "v" },
  ],
];

// Flat array indexed by LOCAL pad idx (0..15)
export const PADS: ReadonlyArray<PadDefinition> = (() => {
  const flat = new Array<PadDefinition>(16);
  PAD_LAYOUT.flat().forEach((p) => {
    flat[p.idx] = p;
  });
  return flat as ReadonlyArray<PadDefinition>;
})();

/** QWERTY key → LOCAL pad index (0..15) */
export const KEY_TO_IDX: Readonly<Record<string, PadIndex>> = (() => {
  const map: Record<string, PadIndex> = {};
  PADS.forEach((p) => {
    map[p.key] = p.idx;
  });
  return map;
})();

/**
 * Per-bank pad count (16).
 * @deprecated Prefer `PADS_PER_BANK`.  Kept for back-compat.
 */
export const TOTAL_PADS = PADS_PER_BANK;
