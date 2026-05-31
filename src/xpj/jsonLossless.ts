/**
 * jsonLossless.ts — Lexeme-preserving JSON parse/serialise for the `.xpj` format.
 *
 * Why this exists
 * ---------------
 * The Akai MPC `.xpj` payload is type-strict: the firmware deserialises numeric
 * fields into typed slots (float vs int), and float-typed fields MUST carry a
 * decimal point (`1.0`, never `1`). A real `project.xpj` contains tens of
 * thousands of `N.0` float tokens.
 *
 * JavaScript's `JSON.parse` / `JSON.stringify` cannot preserve this distinction:
 * `JSON.parse("1.0")` yields the number `1`, and `JSON.stringify(1)` yields
 * `"1"`. A round-trip through the standard JSON functions therefore strips every
 * integer-valued float, producing a project the MPC rejects with a fatal
 * "parameter length" load error (and garbled per-voice playback parameters).
 *
 * This module preserves number formatting by representing every number as a
 * `RawNum` tag — a plain object `{ __raw__: "<lexeme>" }` carrying the exact
 * source text of the number. `parseLossless` emits these tags; `stringifyLossless`
 * writes them back verbatim. Because `RawNum` is a plain object (not a class), it
 * survives `structuredClone`, which `buildXpj` relies on.
 *
 * Plain JS numbers are still accepted by `stringifyLossless` (serialised via
 * `String(n)`), which is correct for integers; genuinely-float values that the
 * builder introduces should be wrapped with `floatNum` so they render with a
 * decimal point.
 */

/** A number represented by its exact source lexeme (e.g. `"1.0"`, `"0.5"`, `"28"`). */
export type RawNum = { readonly __raw__: string };

/** Type guard for the `RawNum` tag object. */
export function isRawNum(v: unknown): v is RawNum {
  return typeof v === "object" && v !== null && typeof (v as RawNum).__raw__ === "string";
}

/**
 * Force a number to a string with at least one decimal digit.
 * Integers become `"1.0"`; non-integer floats stringify as-is (`"0.5"`).
 */
export function toDecimalString(n: number): string {
  if (!Number.isFinite(n)) {
    throw new RangeError(`floatNum received non-finite value: ${n}`);
  }
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

/**
 * Wrap a number as a float lexeme so it serialises with a decimal point.
 * `floatNum(1)` → `{__raw__: "1.0"}`, `floatNum(0.5)` → `{__raw__: "0.5"}`.
 */
export function floatNum(n: number): RawNum {
  return { __raw__: toDecimalString(n) };
}

/**
 * Wrap a number as an integer lexeme (no decimal point).
 * `intNum(60)` → `{__raw__: "60"}`.
 */
export function intNum(n: number): RawNum {
  if (!Number.isFinite(n)) {
    throw new RangeError(`intNum received non-finite value: ${n}`);
  }
  return { __raw__: String(Math.trunc(n)) };
}

/**
 * Serialise a value to compact JSON, emitting `RawNum` tags as their raw lexeme.
 *
 * - `RawNum` → its `__raw__` text verbatim (preserves `1.0`, `0.0`, etc.).
 * - plain `number` → `String(n)` (correct for integers; use `floatNum` for floats).
 * - strings escaped via `JSON.stringify`; objects/arrays compact; `undefined`
 *   object members are skipped and `undefined` array members become `null`,
 *   matching `JSON.stringify` semantics.
 */
export function stringifyLossless(value: unknown): string {
  const out: string[] = [];
  writeValue(value, out);
  return out.join("");
}

function writeValue(v: unknown, out: string[]): void {
  if (isRawNum(v)) {
    out.push(v.__raw__);
    return;
  }
  if (v === null) {
    out.push("null");
    return;
  }

  switch (typeof v) {
    case "string":
      out.push(JSON.stringify(v));
      return;
    case "boolean":
      out.push(v ? "true" : "false");
      return;
    case "number":
      if (!Number.isFinite(v)) {
        throw new RangeError(`Cannot serialise non-finite number: ${v}`);
      }
      out.push(String(v));
      return;
    case "object": {
      if (Array.isArray(v)) {
        out.push("[");
        for (let i = 0; i < v.length; i++) {
          if (i > 0) out.push(",");
          const item = v[i];
          writeValue(item === undefined ? null : item, out);
        }
        out.push("]");
        return;
      }
      out.push("{");
      let first = true;
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (val === undefined) continue; // match JSON.stringify: drop undefined members
        if (!first) out.push(",");
        first = false;
        out.push(JSON.stringify(k));
        out.push(":");
        writeValue(val, out);
      }
      out.push("}");
      return;
    }
    default:
      throw new TypeError(`Cannot serialise value of type ${typeof v}`);
  }
}

/**
 * Parse a JSON string into plain objects/arrays/strings/booleans/null, with
 * every number represented as a `RawNum` tag carrying its exact source lexeme.
 *
 * Used for the `.xpj` template so that all float formatting is preserved through
 * a parse → mutate → serialise cycle.
 */
export function parseLossless(text: string): unknown {
  const p = new LosslessParser(text);
  p.skipWs();
  const value = p.parseValue();
  p.skipWs();
  if (p.pos !== text.length) {
    throw new SyntaxError(`parseLossless: unexpected trailing characters at offset ${p.pos}`);
  }
  return value;
}

class LosslessParser {
  readonly text: string;
  pos = 0;

  constructor(text: string) {
    this.text = text;
  }

  skipWs(): void {
    const t = this.text;
    while (this.pos < t.length) {
      const c = t.charCodeAt(this.pos);
      // space, tab, LF, CR
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
        this.pos++;
      } else {
        break;
      }
    }
  }

  parseValue(): unknown {
    const c = this.text[this.pos];
    switch (c) {
      case "{":
        return this.parseObject();
      case "[":
        return this.parseArray();
      case '"':
        return this.parseString();
      case "t":
        this.expectLiteral("true");
        return true;
      case "f":
        this.expectLiteral("false");
        return false;
      case "n":
        this.expectLiteral("null");
        return null;
      default:
        if (c === "-" || (c >= "0" && c <= "9")) return this.parseNumber();
        throw new SyntaxError(
          `parseLossless: unexpected token '${c ?? "EOF"}' at offset ${this.pos}`,
        );
    }
  }

  private expectLiteral(lit: string): void {
    if (!this.text.startsWith(lit, this.pos)) {
      throw new SyntaxError(`parseLossless: expected '${lit}' at offset ${this.pos}`);
    }
    this.pos += lit.length;
  }

  private parseObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    this.pos++; // consume '{'
    this.skipWs();
    if (this.text[this.pos] === "}") {
      this.pos++;
      return obj;
    }
    for (;;) {
      this.skipWs();
      if (this.text[this.pos] !== '"') {
        throw new SyntaxError(`parseLossless: expected object key at offset ${this.pos}`);
      }
      const key = this.parseString();
      this.skipWs();
      if (this.text[this.pos] !== ":") {
        throw new SyntaxError(`parseLossless: expected ':' at offset ${this.pos}`);
      }
      this.pos++; // consume ':'
      this.skipWs();
      obj[key] = this.parseValue();
      this.skipWs();
      const ch = this.text[this.pos];
      if (ch === ",") {
        this.pos++;
        continue;
      }
      if (ch === "}") {
        this.pos++;
        return obj;
      }
      throw new SyntaxError(`parseLossless: expected ',' or '}' at offset ${this.pos}`);
    }
  }

  private parseArray(): unknown[] {
    const arr: unknown[] = [];
    this.pos++; // consume '['
    this.skipWs();
    if (this.text[this.pos] === "]") {
      this.pos++;
      return arr;
    }
    for (;;) {
      this.skipWs();
      arr.push(this.parseValue());
      this.skipWs();
      const ch = this.text[this.pos];
      if (ch === ",") {
        this.pos++;
        continue;
      }
      if (ch === "]") {
        this.pos++;
        return arr;
      }
      throw new SyntaxError(`parseLossless: expected ',' or ']' at offset ${this.pos}`);
    }
  }

  private parseString(): string {
    const start = this.pos;
    this.pos++; // consume opening '"'
    let hasEscape = false;
    const t = this.text;
    for (;;) {
      const ch = t[this.pos];
      if (ch === undefined) {
        throw new SyntaxError(`parseLossless: unterminated string starting at offset ${start}`);
      }
      if (ch === "\\") {
        hasEscape = true;
        this.pos += 2; // skip escape + escaped char
        continue;
      }
      if (ch === '"') {
        this.pos++; // consume closing '"'
        break;
      }
      this.pos++;
    }
    const raw = t.slice(start, this.pos); // includes surrounding quotes
    return hasEscape ? (JSON.parse(raw) as string) : raw.slice(1, -1);
  }

  private parseNumber(): RawNum {
    const start = this.pos;
    const t = this.text;
    if (t[this.pos] === "-") this.pos++;
    while (this.pos < t.length) {
      const c = t.charCodeAt(this.pos);
      // digit | '.' | 'e' | 'E' | '+' | '-'
      if (
        (c >= 0x30 && c <= 0x39) ||
        c === 0x2e ||
        c === 0x65 ||
        c === 0x45 ||
        c === 0x2b ||
        c === 0x2d
      ) {
        this.pos++;
      } else {
        break;
      }
    }
    return { __raw__: t.slice(start, this.pos) };
  }
}
