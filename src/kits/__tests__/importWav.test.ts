import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetImportCounter,
  buildUserSamplePad,
  importWavFile,
  sanitizeFileName,
} from "../importWav";
import type { GlobalPadIdx } from "../kit.types";

// ── jsdom polyfill ────────────────────────────────────────────────────────────
// jsdom does not implement Blob/File.prototype.arrayBuffer. Polyfill it
// so importWavFile (which calls file.arrayBuffer()) works in tests.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal WAV File with a given name and optional MIME type. */
function makeWavFile(name: string, type = "audio/wav"): File {
  // A minimal valid WAV header (44 bytes) followed by 4 bytes of zero PCM.
  const header = new Uint8Array([
    // RIFF chunk
    0x52,
    0x49,
    0x46,
    0x46, // "RIFF"
    0x24,
    0x00,
    0x00,
    0x00, // ChunkSize = 36 + 0 data = 36
    0x57,
    0x41,
    0x56,
    0x45, // "WAVE"
    // fmt sub-chunk
    0x66,
    0x6d,
    0x74,
    0x20, // "fmt "
    0x10,
    0x00,
    0x00,
    0x00, // Subchunk1Size = 16
    0x01,
    0x00, // AudioFormat = PCM
    0x01,
    0x00, // NumChannels = 1
    0x44,
    0xac,
    0x00,
    0x00, // SampleRate = 44100
    0x88,
    0x58,
    0x01,
    0x00, // ByteRate = 88200
    0x02,
    0x00, // BlockAlign = 2
    0x10,
    0x00, // BitsPerSample = 16
    // data sub-chunk
    0x64,
    0x61,
    0x74,
    0x61, // "data"
    0x00,
    0x00,
    0x00,
    0x00, // Subchunk2Size = 0
  ]);
  return new File([header], name, { type });
}

beforeEach(() => {
  _resetImportCounter();
});

// ── sanitizeFileName ──────────────────────────────────────────────────────────

describe("sanitizeFileName", () => {
  it("preserves safe characters and normalises extension to lowercase .wav", () => {
    expect(sanitizeFileName("808 Kick (1).WAV")).toBe("808 Kick (1).wav");
  });

  it("strips path separators (forward slash)", () => {
    expect(sanitizeFileName("drums/kick.wav")).toBe("kick.wav");
  });

  it("strips path separators (backslash)", () => {
    expect(sanitizeFileName("drums\\snare.wav")).toBe("snare.wav");
  });

  it("strips disallowed characters like &, #, @", () => {
    expect(sanitizeFileName("my&kick#1@.wav")).toBe("mykick1.wav");
  });

  it("preserves underscores and hyphens", () => {
    expect(sanitizeFileName("hi_hat-open.wav")).toBe("hi_hat-open.wav");
  });

  it("falls back to 'imported.wav' for a name that is all-stripped", () => {
    expect(sanitizeFileName("###.wav")).toBe("imported.wav");
  });

  it("normalises .WAV extension to .wav", () => {
    expect(sanitizeFileName("Snare.WAV")).toBe("Snare.wav");
  });

  it("always appends .wav even when input has no extension", () => {
    // sanitizeFileName receives the raw File.name which always has .wav due to
    // importWavFile validation; but the function itself should handle the case.
    expect(sanitizeFileName("mysample")).toBe("mysample.wav");
  });

  it("trims leading/trailing spaces", () => {
    expect(sanitizeFileName("  kick  .wav")).toBe("kick.wav");
  });
});

// ── importWavFile ─────────────────────────────────────────────────────────────

describe("importWavFile", () => {
  it("resolves with correct fileName, sampleName, bytes for a valid wav", async () => {
    const file = makeWavFile("808 Kick.wav");
    const result = await importWavFile(file);

    expect(result.fileName).toBe("808 Kick.wav");
    expect(result.sampleName).toBe("808 Kick");
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("assigns sampleId prefixed with 'user:'", async () => {
    const file = makeWavFile("snare.wav");
    const result = await importWavFile(file);
    expect(result.sampleId.startsWith("user:")).toBe(true);
  });

  it("first import sampleId is 'user:<fileName>'", async () => {
    const file = makeWavFile("kick.wav");
    const result = await importWavFile(file);
    expect(result.sampleId).toBe("user:kick.wav");
  });

  it("second import of same name gets a counter suffix to avoid collision", async () => {
    const file1 = makeWavFile("kick.wav");
    const file2 = makeWavFile("kick.wav");
    const r1 = await importWavFile(file1);
    const r2 = await importWavFile(file2);
    expect(r1.sampleId).not.toBe(r2.sampleId);
    expect(r2.sampleId).toContain(":2");
  });

  it("bytes match the file's arrayBuffer content", async () => {
    const raw = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const file = new File([raw], "test.wav", { type: "audio/wav" });
    const result = await importWavFile(file);
    expect(result.bytes[0]).toBe(0x52); // 'R'
    expect(result.bytes[1]).toBe(0x49); // 'I'
    expect(result.bytes[2]).toBe(0x46); // 'F'
    expect(result.bytes[3]).toBe(0x46); // 'F'
  });

  it("accepts audio/x-wav MIME type", async () => {
    const file = makeWavFile("hihat.wav", "audio/x-wav");
    await expect(importWavFile(file)).resolves.toBeDefined();
  });

  it("accepts audio/wave MIME type", async () => {
    const file = makeWavFile("clap.wav", "audio/wave");
    await expect(importWavFile(file)).resolves.toBeDefined();
  });

  it("accepts empty MIME type (browser may omit it)", async () => {
    const file = makeWavFile("tom.wav", "");
    await expect(importWavFile(file)).resolves.toBeDefined();
  });

  it("rejects a non-.wav file name even if type is audio/wav", async () => {
    const file = new File([new Uint8Array(4)], "sample.mp3", {
      type: "audio/wav",
    });
    await expect(importWavFile(file)).rejects.toThrow(".wav");
  });

  it("rejects a file with wrong MIME type and non-wav extension", async () => {
    const file = new File([new Uint8Array(4)], "sample.aiff", {
      type: "audio/aiff",
    });
    await expect(importWavFile(file)).rejects.toThrow();
  });

  it("error message names the offending file", async () => {
    const file = new File([new Uint8Array(4)], "bad_file.mp3", {
      type: "audio/mpeg",
    });
    await expect(importWavFile(file)).rejects.toThrow("bad_file.mp3");
  });

  it("sanitizes a file name with disallowed characters", async () => {
    const file = makeWavFile("my&sample!.wav");
    const result = await importWavFile(file);
    expect(result.fileName).toBe("mysample.wav");
    expect(result.sampleName).toBe("mysample");
  });
});

// ── buildUserSamplePad ────────────────────────────────────────────────────────

describe("buildUserSamplePad", () => {
  it("builds a SamplePad with default tune/gain/pan values", async () => {
    const file = makeWavFile("perc.wav");
    const imported = await importWavFile(file);
    const pad = buildUserSamplePad(5 as GlobalPadIdx, imported);

    expect(pad.globalPadIdx).toBe(5);
    expect(pad.sampleId).toBe(imported.sampleId);
    expect(pad.displayName).toBe("perc");
    expect(pad.sampleName).toBe("perc");
    expect(pad.fileName).toBe("perc.wav");
    expect(pad.url).toBeNull();
    expect(pad.coarseTune).toBe(0);
    expect(pad.fineTune).toBe(0);
    expect(pad.gainCoefficient).toBe(1);
    expect(pad.pan).toBe(0.5);
  });

  it("url is null (bytes are in userSamples, not HTTP)", async () => {
    const file = makeWavFile("snare.wav");
    const imported = await importWavFile(file);
    const pad = buildUserSamplePad(0 as GlobalPadIdx, imported);
    expect(pad.url).toBeNull();
  });
});
