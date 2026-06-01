/**
 * kit.types.ts — shared data contracts for sample-based preset kits.
 *
 * FROZEN after Wave 0.  All downstream agents (WP-A … WP-G) code against
 * these types without modification.
 */

/**
 * A flat pad index spanning the full 8-bank MPC address space.
 *
 * Range 0..127 (inclusive).  Bank derivation:
 *   bankIdx  = globalPadIdx >> 4   (0=A … 7=H)
 *   localIdx = globalPadIdx & 0xf  (0..15 within the bank)
 */
export type GlobalPadIdx = number;

/**
 * Stable, kit-relative identifier for a sample.
 *
 * For preset samples this is typically the `fileName` stem (e.g.
 * `"808Kick (1).wav"`).  For user-imported samples it is a UUID-like
 * string assigned at import time.  Two `SamplePad` entries that share
 * the same `sampleId` reference the same decoded buffer.
 */
export type SampleId = string;

/**
 * Describes one populated pad within a `SampleKit`.
 *
 * Maps 1-to-1 with an `.xpj` `instruments[globalPadIdx]` entry.
 * Fields that have an explicit default require no special UI treatment
 * when the user has not customised them.
 */
export type SamplePad = {
  /** Absolute pad address in the 8-bank space (0..127). */
  globalPadIdx: GlobalPadIdx;

  /**
   * Stable identifier for the sample buffer.
   * Used as a lookup key in `userSamples` (Map<SampleId, Uint8Array>)
   * and as a de-dup key when building `data.samples[]` in the `.xpj`.
   */
  sampleId: SampleId;

  /**
   * User-editable label shown on the pad face in the UI.
   * Initialised from `sampleName` stem; may be customised freely.
   */
  displayName: string;

  /**
   * The `.xpj` sample name string (verbatim value of
   * `instruments[idx].layersv[0].sampleName` and `data.samples[n].name`).
   * Never sanitised — filename fidelity is critical for MPC compatibility.
   */
  sampleName: string;

  /**
   * The `.xpj` sample file path (verbatim value of
   * `instruments[idx].layersv[0].sampleFile` and `data.samples[n].path`).
   * E.g. `"808Kick (1).wav"`.  ZIP entry name must equal this exactly.
   */
  fileName: string;

  /**
   * Absolute URL under `/kits/<kitId>/<fileName>` for preset samples;
   * `null` for user-imported samples (whose bytes live in `userSamples`).
   */
  url: string | null;

  /**
   * Coarse pitch shift in semitones.
   * Written to `instruments[idx].coarseTune` in the `.xpj`.
   * Range: -36..36 (integer).  Default: 0.
   */
  coarseTune: number;

  /**
   * Fine pitch shift in cents.
   * Written to `instruments[idx].fineTune` in the `.xpj`.
   * Range: -100..100 (integer).  Default: 0.
   */
  fineTune: number;

  /**
   * Linear gain coefficient (not dB).
   * Written to `instruments[idx].layersv[0].volume.gainCoefficient`.
   * Default: 1.0.  Serialised with a decimal point to match Python output.
   */
  gainCoefficient: number;

  /**
   * Stereo pan position.
   * Range: 0..1 where 0.5 = centre.
   * Written to `instruments[idx].layersv[0].pan` in the `.xpj`.
   * Default: 0.5.  Serialised with a decimal point.
   */
  pan: number;

  /**
   * Trim start point in sample frames (inclusive).
   * Written to `instruments[idx].layersv[0].sampleStart` and
   * `sliceInfo.Start` in the `.xpj`. Absent = start from frame 0.
   */
  sampleStart?: number;

  /**
   * Trim end point in sample frames (exclusive).
   * Written to `instruments[idx].layersv[0].sampleEnd` and
   * `sliceInfo.End` in the `.xpj`. Absent = play to the last frame.
   */
  sampleEnd?: number;
};

/**
 * A complete, loadable sample kit.
 *
 * Mirrors the structure written to `public/kits/<id>/manifest.json`.
 * Only *populated* pads are listed in `pads`; unpopulated pad slots
 * receive a blank instrument in the `.xpj` writer.
 */
export type SampleKit = {
  /** URL-safe identifier matching the `public/kits/<id>/` directory name. */
  id: string;

  /** Human-readable name shown in the kit picker UI. */
  displayName: string;

  /**
   * Name written to `data.tracks[0].name` in the `.xpj` and used as the
   * base name for the exported ZIP (`<exportName>.xpj` /
   * `<exportName>_[ProjectData]/`).
   */
  exportName: string;

  /** Musical key of the kit, e.g. `"C Minor"`. */
  key: string;

  /** Native BPM of the source project, e.g. 114. */
  bpm: number;

  /** Populated pads only (sparse — not all 128 entries present). */
  pads: SamplePad[];
};

/**
 * Exact JSON shape stored at `public/kits/<id>/manifest.json`.
 *
 * Kept as an alias so serialisation/deserialisation code can reference the
 * manifest shape by its intent while remaining in sync with `SampleKit`.
 */
export type KitManifest = SampleKit;

/**
 * Lightweight registry entry used by `src/kits/registry.ts`.
 *
 * Listed in the bundled registry so the app can offer kits even before
 * WAVs are copied to `public/kits/`.
 */
export type KitRegistryEntry = {
  /** Matches `SampleKit.id` and the `public/kits/<id>/` directory name. */
  id: string;

  /** Display label for the kit picker. */
  displayName: string;

  /** Number of populated pads (informational; shown in the UI). */
  padCount: number;
};
