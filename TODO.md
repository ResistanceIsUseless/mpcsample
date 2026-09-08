# mpcsample fork — TODO

Working branch: `feature/sample-library-browser` (also carries the MIDI work below — not yet split out).

## Done

- Sample Library Browser: scan/browse/preview/drag-to-pad for large local sample folders, offloaded to the Electron main process so it never blocks on huge libraries.
- Sample tagging: pack facet (derived from folder structure) + auto-tag taxonomy from folder/filename keywords + manual tag editor, persisted separately from the scan cache.
- Fixed playback of WAV files with a trailing RIFF `LIST`/`INFO` metadata chunk (FL Studio export quirk) — `mpc-sample://` protocol now serves only the header-declared audio-data range, not the raw file size.
- MIDI input fixed: MPC Sample hardware shifts the outgoing note number by 16 per physical pad bank (Bank A = 36–51, Bank B = 52–67, ...) — the app previously only accepted notes 36–51, silently dropping every bank past A. Now derives the global pad index directly from the note number, and the on-screen bank follows the hardware's active bank automatically.
  - Real hardware settings required (SHIFT + PAD 8 → MIDI Configuration menu): **MIDI Port = USB**, **Pad MIDI Out = Always**.

- MIDI *output*, verified working end-to-end on real hardware: UI-triggered pad hits (on-screen click, keyboard shortcuts) send Note On/Off back out over USB MIDI to every connected output — implemented in `MidiInput` (now also `MidiOutputLike`), wired through `store.midiOutRef`/`setMidiOut`. `triggerPad`/`releasePad` take a `fromHardware` flag so hardware-originated triggers (from `useMidiInput`) don't get echoed back to the device. Requires **Pad MIDI In = On** on the MPC Sample (SHIFT + PAD 8 → MIDI Configuration).

- Explored `mpc-sample.local` (the firmware-update page served over USB) — confirmed it's just the firmware updater with no additional control surface beyond MIDI worth building on for this product. Detailed research notes (including a firmware-level security review) are kept in a local, uncommitted file, not in this repo.
- **Step sequencer (v1, live/MIDI-driven)** — shipped 2026-09-07. `src/sequencer/` (`sequencer.types.ts`, `sequencerStore.ts`, `PatternPlayer.ts`) + `src/components/StepSequencer.tsx`, opened via the repurposed "SEQ RECORD" button. Configurable bars (1–8) and resolution (8th/16th/32nd). Plays via the existing hardware-style PLAY/STOP transport buttons, triggering pads through `engineRef`/`midiOutRef` directly (bypassing `triggerPad`'s side effects) per the `PatternPlayer` hook already left in `store.pressPad`/`unpressPad`'s doc comments. Does **not** export to native `.xpj` sequences (see "Planned" below).

- Step sequencer follow-ups (2026-09-07): pattern now **persists to localStorage** (`mpc.sequencerPattern`, survives reload — see `sequencerStore.ts`'s `readPersistedPattern`/`writePersistedPattern` + a `subscribe()` that writes on every pattern change, transient `isPlaying`/`currentStep` excluded). Added **per-step velocity editing**: scroll up/down on an active step cell to raise/lower its velocity (0.1 increments, floor 0.1), with opacity scaling to show velocity visually.

- **Native `.xpj` sequence export** (2026-09-07) — the step sequencer pattern now exports into the project's real, editable native sequence data (not just live/MIDI playback). Reverse-engineered the event schema from a real recorded `.xpj` (note events live at `sequences[].value.trackClipMaps[0][entryIdx].value.eventList.events`, keyed per-track, 960 ticks/beat, `note.note = padIdx + 36`, `note.velocity` 0..1 — see `src/xpj/buildSequence.ts`). Wired into the existing kit-export pipeline (`buildXpj`/`buildProjectArtifacts`/`exportKitToZip`/`exportKitToDisk`) via an optional `pattern` param, and into `ExportButton.tsx` as an "Include step sequencer pattern" checkbox (shown only when the current pattern has active steps). Writes into a reserved sequence slot (`key === 0`); one pattern at a time, no song-mode export.

- **Draggable panels + hideable HUD** (2026-09-08) — Sample Browser and Step Sequencer can now be dragged by their header to anywhere on screen (`src/hooks/useDraggablePanel.ts`; pointer-drag, matching the existing `Knob`/`PitchFader` idiom), double-click the header to reset to the docked position. Position isn't persisted across reload and dragging is disabled below the 480px mobile breakpoint. KitEditor intentionally left undragged. The bottom-left HUD (keyboard shortcuts/bank/MIDI status/toolbar) can now be hidden via a "HIDE" button, leaving a small always-visible restore tab in its place; `hudVisible` persists to `localStorage` alongside the other settings in `src/state/store.ts`.

## Planned

- Sample-accurate MIDI-out timing for the sequencer (v1 sends MIDI immediately per step rather than clock-aligned — a few ms of jitter, documented as a known v1 limitation).
- Multiple saved patterns / song mode (currently one in-memory-and-persisted pattern at a time).
- Swing/groove control.

## Reference

- MPC Sample User Guide (Akai, v1.0): MIDI Configuration menu is on page 60. Firmware/web-updater section on page 4 (`mpc-sample.local`, fallback `192.168.155.1`).
