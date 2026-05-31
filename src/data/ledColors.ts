import type { LedColor, LedPalette } from "../types/mpc.types";

export const LED_COLORS: Readonly<Record<LedColor, LedPalette>> = {
  BLUE: { ring: "#2cc8f7", press: "#ffd200", press2: "#ffae00" },
  GREEN: { ring: "#3cf28a", press: "#ffd200", press2: "#ffae00" },
  PURPLE: { ring: "#c478ff", press: "#ffd200", press2: "#ffae00" },
  ORANGE: { ring: "#ff8a2a", press: "#ffd9a8", press2: "#ffb04a" },
  RED: { ring: "#ff5544", press: "#ffd200", press2: "#ffae00" },
};

export const LED_COLOR_NAMES: ReadonlyArray<LedColor> = [
  "BLUE",
  "GREEN",
  "PURPLE",
  "ORANGE",
  "RED",
];

export const KIT_NAMES = ["HIP-HOP", "TRAP", "HOUSE", "TR-808", "TR-909"] as const;
