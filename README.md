# MPC Sample

Web + desktop Akai MPC sample drum machine with `.xpj` project export.

Runs as a browser app (Vite dev server) or as a packaged desktop app (Electron). Load drum kits built from real Akai `.xpj` project files, sequence patterns, and export back to `.xpj` for playback on hardware.

**Package:** `@worldlinkstudio/mpcsample` — License: GPL-3.0

---

## Prerequisites

- Node.js >= 18
- npm

---

## Installation

```bash
git clone <repo-url>
cd mpcsample
npm install
```

After cloning, regenerate the kit assets (see [Kit Generation](#kit-generation)):

```bash
npm run build-kits
```

---

## Development

**Browser (Vite dev server, port 4404):**

```bash
npm run dev
```

**Electron (renderer on port 4406):**

```bash
npm run electron:dev
```

---

## Scripts

| Script                   | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `npm run dev`            | Start Vite dev server (browser, port 4404)            |
| `npm run build`          | Build React library to `dist/`                        |
| `npm run electron:dev`   | Start Electron in dev mode (renderer port 4406)       |
| `npm run electron:build` | Build Electron app to `out/`                          |
| `npm run electron:dist`  | Package distributable via electron-builder            |
| `npm run build-kits`     | Regenerate `public/kits/` from `MPC-Sample/Projects/` |
| `npm test`               | Run all tests (Vitest)                                |
| `npm run typecheck`      | TypeScript type-check, no emit                        |
| `npm run lint`           | Biome lint                                            |
| `npm run format`         | Biome format (write)                                  |
| `npm run check`          | Biome lint + format check                             |

---

## Kit Generation

Kit assets are not committed to the repository. They are generated from Akai project files stored locally in `MPC-Sample/` (also gitignored, ~300 MB of WAV samples).

The `build-kits` script reads `.xpj` project files from `MPC-Sample/Projects/` and copies WAV samples into `public/kits/<id>/`, producing the kit manifests the app expects at runtime.

```bash
npm run build-kits
```

Run this once after cloning, and again whenever `MPC-Sample/Projects/` changes. The `MPC-Sample/` directory is an irreplaceable build input — keep it on disk alongside the repo.

---

## Project Structure

```
mpcsample/
├── src/                  # React components, audio engine, Zustand state, xpj codec
├── electron/             # Electron main process, preload script, fs operations
├── scripts/              # build-kits.mjs and other build utilities
├── public/kits/          # Generated kit manifests + WAVs (gitignored)
├── MPC-Sample/           # Akai project files — gitignored, kept on disk
├── index.html
├── vite.config.ts
├── electron.vite.config.ts
├── electron-builder.yml
└── biome.json
```

---

## Tech Stack

- **React 19** + **TypeScript**
- **Vite 6** (browser build) / **electron-vite** (Electron build)
- **Electron 35**
- **Zustand** — state management
- **Web Audio API** / **Tone.js** — audio engine
- **fflate** — zip compression (`.xpj` export)
- **Tailwind CSS v4**
- **Vitest** — unit tests
- **Biome** — formatter + linter

---

## macOS Note

The packaged app is unsigned. macOS will quarantine it after download or distribution. Remove the quarantine attribute before launching:

**On the installed app:**

```bash
xattr -dr com.apple.quarantine "/Applications/MPC Sample.app"
```

**On an extracted `.app` before installing:**

```bash
xattr -cr "MPC Sample.app"
```

---

## .xpj Format Note

The `.xpj` file format stores sample filenames as a sequence of 4-byte IEEE 754 float tokens — not a string type. This matches the Akai firmware's internal serialization format and was confirmed by cross-referencing with a Python reference implementation (`make_xpj.py`). The codec in `src/xpj/` faithfully encodes and decodes this representation to ensure compatibility with MPC hardware.

---

## License

GPL-3.0 — see [LICENSE](LICENSE).
