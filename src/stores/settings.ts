import { create } from "zustand";
import { DEFAULT_THEME_ID } from "../themes";

export type CursorStyle = "bar" | "block" | "underline";
export type NewTabFolder = "current" | "home";

export interface Settings {
  themeId: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  /** Window opacity, 50–100 (%). */
  opacity: number;
  /** How strongly what's behind the window is blurred when it's
   *  see-through, 0 (off) to MAX_BLUR. */
  blurRadius: number;
  copyOnSelect: boolean;
  restoreSession: boolean;
  newTabFolder: NewTabFolder;
  /** Show the suggestion menu while typing (Tab always shows it). */
  suggestWhileTyping: boolean;
  /** Colour commands, flags, strings... in the input box. */
  syntaxHighlighting: boolean;
  /** Smooth motion for panels, menus and tabs (also follows macOS Reduce motion). */
  animations: boolean;
  /** Lines of output kept per pane. More = longer history, more memory. */
  scrollback: number;
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: DEFAULT_THEME_ID,
  fontFamily: '"JetBrains Mono"',
  fontSize: 13,
  lineHeight: 1.3,
  cursorStyle: "bar",
  cursorBlink: true,
  opacity: 100,
  blurRadius: 20,
  copyOnSelect: false,
  restoreSession: true,
  newTabFolder: "current",
  suggestWhileTyping: true,
  syntaxHighlighting: true,
  animations: true,
  scrollback: 10_000,
};

export const FONT_CHOICES = [
  { label: "JetBrains Mono (built in)", value: '"JetBrains Mono"' },
  { label: "SF Mono", value: '"SF Mono"' },
  { label: "Menlo", value: "Menlo" },
  { label: "Monaco", value: "Monaco" },
  { label: "Hack", value: "Hack" },
  { label: "Fira Code", value: '"Fira Code"' },
  { label: "Cascadia Code", value: '"Cascadia Code"' },
  { label: "Source Code Pro", value: '"Source Code Pro"' },
];

/** Font stack with fallbacks, so a missing font never breaks the terminal. */
export const fontStack = (family: string) => `${family}, "JetBrains Mono", Menlo, Monaco, "Cascadia Mono", Consolas, monospace`;

export const MAX_BLUR = 64;

/** Settings saved by older versions: the on/off "blur" became a radius. */
export function migrateSettings(saved: Record<string, unknown>): Record<string, unknown> {
  const out = { ...saved };
  if (typeof out.blur === "boolean" && typeof out.blurRadius !== "number") {
    out.blurRadius = out.blur ? DEFAULT_SETTINGS.blurRadius : 0;
  }
  delete out.blur;
  return out;
}

export const MIN_FONT = 9;
export const MAX_FONT = 28;
const KEY = "nova.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const saved: unknown = raw ? JSON.parse(raw) : {};
    const known = typeof saved === "object" && saved ? migrateSettings(saved as Record<string, unknown>) : {};
    return { ...DEFAULT_SETTINGS, ...known };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function save(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

const pick = (s: Settings): Settings => {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = (s as unknown as Record<string, unknown>)[key];
  return out as unknown as Settings;
};

interface SettingsState extends Settings {
  settingsOpen: boolean;
  /** Section to show when Settings opens (e.g. "backup" from the palette). */
  settingsSection: string | null;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  zoom: (step: 1 | -1 | 0) => void;
  setSettingsOpen: (open: boolean, section?: string) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  settingsOpen: false,
  settingsSection: null,

  update: (patch) => {
    set(patch);
    save(pick(get()));
  },

  reset: () => {
    set({ ...DEFAULT_SETTINGS });
    save({ ...DEFAULT_SETTINGS });
  },

  zoom: (step) => {
    const size = get().fontSize;
    const fontSize =
      step === 0 ? DEFAULT_SETTINGS.fontSize : Math.min(MAX_FONT, Math.max(MIN_FONT, size + step));
    get().update({ fontSize });
  },

  setSettingsOpen: (open, section) => set({ settingsOpen: open, settingsSection: section ?? null }),
}));
