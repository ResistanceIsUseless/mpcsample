/**
 * Launcher.test.tsx — Unit tests for the startup project-picker modal.
 *
 * Mocks:
 *  - `../../desktop/bridge` — `isDesktop` always true, `desktop()` returns spies
 *  - `../../desktop/loadProject` — `loadProjectFromDir` and `loadBlankKit` as vi.fn()
 *
 * JSDOM does not have a real file system or native dialog, so all IPC is mocked.
 *
 * Note on button selectors:
 *  The Launcher uses explicit `aria-label` attributes on its buttons; ARIA
 *  accessible name computation uses those labels rather than inner text. Tests
 *  query by the full aria-label patterns.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Launcher } from "../Launcher";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChooseProjectDir = vi.fn<() => Promise<string | null>>();
const mockReadProject = vi.fn();

vi.mock("../../desktop/bridge", () => ({
  isDesktop: () => true,
  desktop: () => ({
    chooseProjectDir: mockChooseProjectDir,
    readProject: mockReadProject,
    isElectron: true as const,
    versions: { app: "0.0.0", electron: "0.0.0", chrome: "0.0.0" },
  }),
}));

const mockLoadProjectFromDir = vi.fn<(dir: string) => Promise<void>>();
const mockLoadBlankKit = vi.fn<() => void>();

vi.mock("../../desktop/loadProject", () => ({
  loadProjectFromDir: (dir: string) => mockLoadProjectFromDir(dir),
  loadBlankKit: () => mockLoadBlankKit(),
}));

// ---------------------------------------------------------------------------
// Selectors (match the aria-label attributes in the component)
// ---------------------------------------------------------------------------

const LOAD_BTN_LABEL = /load an existing akai/i;
const NEW_KIT_BTN_LABEL = /start a new blank kit/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderLauncher(onDismiss = vi.fn()) {
  return render(<Launcher onDismiss={onDismiss} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Launcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Structure ──────────────────────────────────────────────────────────────

  it("renders with role='dialog' and aria-modal", () => {
    renderLauncher();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("has an accessible heading referenced by aria-labelledby", () => {
    renderLauncher();
    const dialog = screen.getByRole("dialog");
    const headingId = dialog.getAttribute("aria-labelledby");
    expect(headingId).toBeTruthy();
    // Use type-safe query rather than non-null assertion.
    const heading = headingId ? document.getElementById(headingId) : null;
    expect(heading).toBeInTheDocument();
    expect(heading?.textContent).toMatch(/MPC Sample/i);
  });

  it("renders a 'Load existing project' button", () => {
    renderLauncher();
    expect(screen.getByRole("button", { name: LOAD_BTN_LABEL })).toBeInTheDocument();
  });

  it("renders a 'New kit' button", () => {
    renderLauncher();
    expect(screen.getByRole("button", { name: NEW_KIT_BTN_LABEL })).toBeInTheDocument();
  });

  // ── New Kit action ─────────────────────────────────────────────────────────

  it("clicking 'New kit' calls loadBlankKit", () => {
    const onDismiss = vi.fn();
    renderLauncher(onDismiss);
    fireEvent.click(screen.getByRole("button", { name: NEW_KIT_BTN_LABEL }));
    expect(mockLoadBlankKit).toHaveBeenCalledOnce();
  });

  it("clicking 'New kit' calls onDismiss", () => {
    const onDismiss = vi.fn();
    renderLauncher(onDismiss);
    fireEvent.click(screen.getByRole("button", { name: NEW_KIT_BTN_LABEL }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  // ── Load existing project action ───────────────────────────────────────────

  it("clicking 'Load existing' calls chooseProjectDir", async () => {
    mockChooseProjectDir.mockResolvedValue(null); // user cancels
    renderLauncher();
    fireEvent.click(screen.getByRole("button", { name: LOAD_BTN_LABEL }));
    await waitFor(() => {
      expect(mockChooseProjectDir).toHaveBeenCalledOnce();
    });
  });

  it("when user cancels picker (null), loadProjectFromDir is NOT called", async () => {
    mockChooseProjectDir.mockResolvedValue(null);
    renderLauncher();
    fireEvent.click(screen.getByRole("button", { name: LOAD_BTN_LABEL }));
    await waitFor(() => {
      expect(mockChooseProjectDir).toHaveBeenCalled();
    });
    expect(mockLoadProjectFromDir).not.toHaveBeenCalled();
  });

  it("when picker returns a dir, loadProjectFromDir is called with that dir", async () => {
    const dir = "/Volumes/MPC-SD/Projects/MyKit";
    mockChooseProjectDir.mockResolvedValue(dir);
    mockLoadProjectFromDir.mockResolvedValue(undefined);

    const onDismiss = vi.fn();
    renderLauncher(onDismiss);
    fireEvent.click(screen.getByRole("button", { name: LOAD_BTN_LABEL }));
    await waitFor(() => {
      expect(mockLoadProjectFromDir).toHaveBeenCalledWith(dir);
    });
  });

  it("on successful load, onDismiss is called", async () => {
    const dir = "/some/project";
    mockChooseProjectDir.mockResolvedValue(dir);
    mockLoadProjectFromDir.mockResolvedValue(undefined);

    const onDismiss = vi.fn();
    renderLauncher(onDismiss);
    fireEvent.click(screen.getByRole("button", { name: LOAD_BTN_LABEL }));
    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });

  // ── Error path ─────────────────────────────────────────────────────────────

  it("shows role='alert' when loadProjectFromDir rejects", async () => {
    const dir = "/bad/project";
    mockChooseProjectDir.mockResolvedValue(dir);
    mockLoadProjectFromDir.mockRejectedValue(new Error("ENOXPJ: no .xpj file found"));

    renderLauncher();
    fireEvent.click(screen.getByRole("button", { name: LOAD_BTN_LABEL }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert").textContent).toMatch(/no .xpj file found/i);
  });

  it("shows role='alert' when chooseProjectDir rejects", async () => {
    mockChooseProjectDir.mockRejectedValue(new Error("Picker failed"));

    renderLauncher();
    fireEvent.click(screen.getByRole("button", { name: LOAD_BTN_LABEL }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("onDismiss is NOT called when an error occurs", async () => {
    const dir = "/bad/project";
    mockChooseProjectDir.mockResolvedValue(dir);
    mockLoadProjectFromDir.mockRejectedValue(new Error("parse error"));

    const onDismiss = vi.fn();
    renderLauncher(onDismiss);
    fireEvent.click(screen.getByRole("button", { name: LOAD_BTN_LABEL }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it("buttons are disabled while loading", async () => {
    const dir = "/project";
    mockChooseProjectDir.mockResolvedValue(dir);
    // Never resolves — keeps us in loading state for inspection.
    mockLoadProjectFromDir.mockReturnValue(new Promise(() => undefined));

    renderLauncher();
    fireEvent.click(screen.getByRole("button", { name: LOAD_BTN_LABEL }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: LOAD_BTN_LABEL })).toBeDisabled();
      expect(screen.getByRole("button", { name: NEW_KIT_BTN_LABEL })).toBeDisabled();
    });
  });

  // ── Escape key ─────────────────────────────────────────────────────────────

  it("pressing Escape triggers loadBlankKit and onDismiss", () => {
    const onDismiss = vi.fn();
    renderLauncher(onDismiss);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(mockLoadBlankKit).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  // ── Focus trap ─────────────────────────────────────────────────────────────

  it("Tab key wraps focus from last to first focusable element", () => {
    renderLauncher();
    const dialog = screen.getByRole("dialog");
    const buttons = screen.getAllByRole("button");
    const lastBtn = buttons[buttons.length - 1];

    // Simulate active element being the last button.
    lastBtn.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false });

    // After wrap, the first focusable element should be focused.
    const firstBtn = buttons[0];
    expect(document.activeElement).toBe(firstBtn);
  });

  it("Shift+Tab wraps focus from first to last focusable element", () => {
    renderLauncher();
    const dialog = screen.getByRole("dialog");
    const buttons = screen.getAllByRole("button");
    const firstBtn = buttons[0];

    firstBtn.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });

    const lastBtn = buttons[buttons.length - 1];
    expect(document.activeElement).toBe(lastBtn);
  });
});
