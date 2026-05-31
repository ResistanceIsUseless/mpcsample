/**
 * main.ts — Electron main process for MPC Sample.
 *
 * Security model:
 * - contextIsolation: true, sandbox: true, nodeIntegration: false
 * - MIDI permissions granted (Web MIDI API); Web Audio requires no permission grant.
 * - CSP via onHeadersReceived: allows bundled assets, inline styles (Tailwind v4),
 *   data/blob URLs, and Google Fonts; `unsafe-eval` only in dev for Vite HMR.
 */

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, dialog, ipcMain, nativeImage, session, shell } from "electron";

const execFileAsync = promisify(execFile);

import type {
  DefaultExportDir,
  DesktopError,
  DesktopErrorCode,
  LoadedProject,
  WriteProjectArgs,
  WriteProjectResult,
} from "../src/desktop/bridge.types";
import { readProjectFromFile, writeProjectToDisk } from "./fsops";
import type { IpcResult } from "./ipc";
import { CH } from "./ipc";
import { DEFAULT_EXPORT_DIR, getDefaultExportDir, VOLUME_ROOT } from "./paths";

function normalizeError(err: unknown): DesktopError {
  if (err instanceof Error) {
    const typed = err as Error & { code?: unknown };
    const knownCodes = new Set<DesktopErrorCode>([
      "CANCELLED",
      "EEXIST",
      "ENOENT",
      "EACCES",
      "ENOXPJ",
      "EUNKNOWN",
    ]);
    const rawCode = String(typed.code ?? "EUNKNOWN");
    const code: DesktopErrorCode = knownCodes.has(rawCode as DesktopErrorCode)
      ? (rawCode as DesktopErrorCode)
      : "EUNKNOWN";
    return { code, message: err.message };
  }
  return { code: "EUNKNOWN", message: String(err) };
}

function ok<T>(result: T): IpcResult<T> {
  return { ok: true, result };
}

function fail(err: unknown): IpcResult<never> {
  return { ok: false, error: normalizeError(err) };
}

// Natural MPC dimensions at 100 % zoom (content area, no title-bar).
const BASE_W = 920;
const BASE_H = 960;

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: BASE_W,
    height: BASE_H,
    show: false,
    autoHideMenuBar: true,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Grant MIDI permissions (Web MIDI API) — Web Audio needs no permission.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "midi" || permission === "midiSysex");
  });
  mainWindow.webContents.session.setPermissionCheckHandler(
    (_wc, permission) => permission === "midi" || permission === "midiSysex",
  );

  // CSP — applied for all navigation responses.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const scriptSrc = is.dev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

    const csp = [
      `default-src 'self' blob: data:`,
      `script-src ${scriptSrc}`,
      // Tone.js creates a clock worker from a blob URL — allow it.
      `worker-src blob: 'self'`,
      // Tailwind v4 injects styles at runtime
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src 'self' data: https://fonts.gstatic.com`,
      `img-src 'self' data: blob:`,
      `media-src 'self' blob: data:`,
      `connect-src 'self' blob: data:`,
    ].join("; ");

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  // Show as soon as the first paint is ready…
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  // …with fallbacks so the window can never get stuck invisible: show once the
  // document finishes loading, and surface any load failure instead of hanging.
  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow.isVisible()) mainWindow.show();
  });
  mainWindow.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[main] renderer failed to load (${errorCode} ${errorDescription}) url=${validatedURL}`,
    );
    if (!mainWindow.isVisible()) mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (is.dev && rendererUrl) {
    if (!app.isPackaged) console.log(`[main] dev: loading renderer URL ${rendererUrl}`);
    if (is.dev) mainWindow.webContents.openDevTools({ mode: "detach" });
    mainWindow.loadURL(rendererUrl).catch((err) => console.error("[main] loadURL failed:", err));
  } else {
    const indexFile = join(__dirname, "../renderer/index.html");
    if (!app.isPackaged) console.log(`[main] prod: loading file ${indexFile}`);
    mainWindow.loadFile(indexFile).catch((err) => console.error("[main] loadFile failed:", err));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(CH.getDefaultExportDir, async (): Promise<IpcResult<DefaultExportDir>> => {
    try {
      const result = await getDefaultExportDir();
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(CH.chooseExportDir, async (): Promise<IpcResult<string | null>> => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
      });
      return ok(canceled || filePaths.length === 0 ? null : filePaths[0]);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(CH.chooseProjectDir, async (): Promise<IpcResult<string | null>> => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Akai Project", extensions: ["xpj"] }],
      });
      return ok(canceled || filePaths.length === 0 ? null : filePaths[0]);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(CH.readProject, async (_event, filePath: string): Promise<IpcResult<LoadedProject>> => {
    try {
      const result = await readProjectFromFile(filePath);
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(CH.ejectVolume, async (): Promise<IpcResult<undefined>> => {
    try {
      await execFileAsync("diskutil", ["eject", VOLUME_ROOT]);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(CH.openPath, async (_event, dir: string): Promise<IpcResult<undefined>> => {
    try {
      await shell.openPath(dir);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    CH.writeProject,
    async (_event, args: WriteProjectArgs): Promise<IpcResult<WriteProjectResult>> => {
      try {
        let destDir = args.destDir;

        if (!destDir) {
          // Try the default export dir first
          const defaultDir = await getDefaultExportDir();
          if (defaultDir.exists) {
            destDir = defaultDir.path;
          } else {
            // Fall back to a native directory picker
            const { canceled, filePaths } = await dialog.showOpenDialog({
              properties: ["openDirectory", "createDirectory"],
              defaultPath: DEFAULT_EXPORT_DIR,
            });
            if (canceled || filePaths.length === 0) {
              return fail(
                Object.assign(new Error("Export cancelled by user."), {
                  code: "CANCELLED" as DesktopErrorCode,
                }),
              );
            }
            destDir = filePaths[0];
          }
        }

        const result = await writeProjectToDisk(args, destDir);
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    },
  );
}

const APP_ICON_PATH = join(app.getAppPath(), "public/favicon/android-chrome-512x512.png");

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.worldlinkstudio.mpcsample");

  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(APP_ICON_PATH));
  }

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Ensure all windows share the MIDI permission policy set above.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "midi" || permission === "midiSysex");
  });
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => permission === "midi" || permission === "midiSysex",
  );

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
