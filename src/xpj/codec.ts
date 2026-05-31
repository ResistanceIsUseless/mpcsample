/**
 * codec.ts — XPJ file format encode/decode + float serialisation helpers.
 *
 * The `.xpj` format is a gzipped concatenation of:
 *   1. A 5-line ASCII header (each line terminated with `\n`)
 *   2. A JSON payload
 *
 * Header lines (fixed):
 *   ACVS
 *   1.3.0.12
 *   SerialisableProjectData
 *   json
 *   Linux
 *
 * Float-format preservation
 * -------------------------
 * The Akai firmware deserialises numeric fields into typed slots; float-typed
 * fields MUST carry a decimal point (`1.0`, never `1`). JavaScript's
 * `JSON.parse` / `JSON.stringify` cannot preserve this distinction, so the
 * template and the encoded payload are handled by the lexeme-preserving codec
 * in `./jsonLossless` (numbers carried as `{__raw__: "<lexeme>"}` tags).
 *
 * `loadTemplate` parses the skeleton with `parseLossless` so all of its float
 * tokens survive, and `encodeXpj` writes the payload with `stringifyLossless`.
 * `floatTag` / `serializeJson` are retained as backward-compatible aliases for
 * `floatNum` / `stringifyLossless`.
 */

import { gunzipSync, gzipSync } from "fflate";
import { floatNum, parseLossless, stringifyLossless } from "./jsonLossless";

export const XPJ_HEADER = ["ACVS", "1.3.0.12", "SerialisableProjectData", "json", "Linux"] as const;

/** Top-level shape of an XPJ JSON payload. */
export type XpjData = { data: Record<string, unknown> };

/**
 * Wrap a number so `serializeJson` emits it with a decimal point.
 * Alias of `floatNum` from `./jsonLossless` (returns a `{__raw__}` tag).
 *
 * @example
 * serializeJson({ gain: floatTag(1) }) // → '{"gain":1.0}'
 * serializeJson({ pan: floatTag(0.5) }) // → '{"pan":0.5}'
 */
export const floatTag = floatNum;

/**
 * Serialise `obj` to a compact JSON string, preserving `{__raw__}` number tags
 * verbatim. Alias of `stringifyLossless` from `./jsonLossless`.
 */
export const serializeJson = stringifyLossless;

/**
 * Encode an `XpjData` object into a gzipped `.xpj` byte array.
 *
 * Payload = `XPJ_HEADER[0..4]` joined with `\n`, then `\n`, then compact JSON.
 */
export function encodeXpj(data: XpjData): Uint8Array {
  const payload = `${XPJ_HEADER.join("\n")}\n${stringifyLossless(data)}`;
  const bytes = new TextEncoder().encode(payload);
  return gzipSync(bytes);
}

/**
 * Decode a `.xpj` byte array back to its header lines and parsed data.
 *
 * Accepts both gzip-compressed and plain-text (uncompressed) variants.
 * The uncompressed variant (`project.xpj`) is used for template inspection.
 */
export function decodeXpj(bytes: Uint8Array): {
  header: string[];
  data: XpjData;
} {
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const raw = isGzip ? gunzipSync(bytes) : bytes;

  const text = new TextDecoder().decode(raw);

  // Split on the first 5 newlines to extract header + payload.
  // The payload itself may contain newlines (pretty-printed JSON).
  const parts = text.split("\n");
  if (parts.length < 6) {
    throw new Error(
      `Invalid XPJ: expected at least 6 newline-delimited parts, got ${parts.length}`,
    );
  }

  const header = parts.slice(0, 5);
  const jsonPayload = parts.slice(5).join("\n");

  return {
    header,
    data: JSON.parse(jsonPayload) as XpjData,
  };
}

/**
 * Return a deep clone of the bundled skeleton template.
 *
 * The skeleton is committed as `template.skeleton.json` (placeholder at
 * compile time; WP-B's build-kits script regenerates it from the real
 * `project.xpj` at dev time).
 *
 * Each call re-parses the raw skeleton text, so callers receive an independent
 * tree they can mutate freely without contaminating future calls.
 *
 * The skeleton is loaded via a dynamic import (`?raw`) so Vite code-splits it
 * into a separate lazily-loaded chunk, keeping the main bundle lean. It is
 * parsed with `parseLossless` so the template's float tokens (e.g. `1.0`,
 * `0.0`) are preserved as `{__raw__}` tags and survive re-serialisation.
 */
export async function loadTemplate(): Promise<XpjData> {
  const mod = await import("./template.skeleton.json?raw");
  return parseLossless(mod.default) as XpjData;
}
