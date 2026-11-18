import { invoke } from "@tauri-apps/api/core";
import { Effect, EffectState, getCurrentWindow } from "@tauri-apps/api/window";
import type { ITheme } from "@xterm/xterm";

import { mix, rgba } from "./color";
import { isMac, isWindows } from "./platform";
import { insideNovaApp } from "./pty";
import { fontStack, type Settings } from "../stores/settings";
import { themeById } from "../themes";

/** Use in styles for monospace text that follows the terminal font setting. */
export const MONO = "var(--nova-mono)";

/** Sets the window chrome colours (CSS variables) from the theme and opacity. */
export function applyAppearance(settings: Settings) {
  const theme = themeById(settings.themeId);
  const bg = theme.terminal.background;
  const fg = theme.terminal.foreground;
  const dark = theme.dark;
  const alpha = Math.min(100, Math.max(50, settings.opacity)) / 100;
  const ink = dark ? "255, 255, 255" : "0, 0, 0";

  const vars: Record<string, string> = {
    "--nova-bg": rgba(bg, alpha),
    "--nova-bg-solid": rgba(bg, 1),
    // Veil over unfocused split panes.
    "--nova-dim": dark ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.35)",
    "--nova-chrome": rgba(mix(bg, "#000000", dark ? 0.25 : 0.035), alpha),
    "--nova-tab-active": rgba(mix(bg, dark ? "#ffffff" : "#000000", 0.06), Math.max(alpha, 0.85)),
    "--nova-panel": rgba(mix(bg, dark ? "#ffffff" : "#000000", dark ? 0.035 : 0.015), 0.97),
    "--nova-text": fg,
    "--nova-muted": mix(fg, bg, 0.4),
    "--nova-faint": mix(fg, bg, 0.6),
    "--nova-accent": theme.accent,
    "--nova-red": theme.terminal.red ?? "#ff5c7a",
    "--nova-border": `rgba(${ink}, ${dark ? 0.07 : 0.09})`,
    "--nova-border-strong": `rgba(${ink}, ${dark ? 0.11 : 0.14})`,
    "--nova-fill": `rgba(${ink}, 0.03)`,
    "--nova-hover": `rgba(${ink}, 0.05)`,
    "--nova-hover-strong": `rgba(${ink}, 0.09)`,
    "--nova-scrollbar": `rgba(${ink}, ${dark ? 0.14 : 0.18})`,
    "--nova-scrollbar-hover": `rgba(${ink}, ${dark ? 0.3 : 0.35})`,
    "--nova-mono": fontStack(settings.fontFamily),
    // Syntax colours for the input box, from the theme's ANSI palette.
    "--nova-ansi-red": theme.terminal.red ?? "#ff5c7a",
    "--nova-ansi-green": theme.terminal.green ?? "#3ddc97",
    "--nova-ansi-yellow": theme.terminal.yellow ?? "#f5c451",
    "--nova-ansi-blue": theme.terminal.blue ?? "#5aa9ff",
    "--nova-ansi-magenta": theme.terminal.magenta ?? "#b48cff",
    "--nova-ansi-cyan": theme.terminal.cyan ?? "#22d3ee",
  };

  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  root.style.colorScheme = dark ? "dark" : "light";

  // Blur only shows through a see-through window.
  void applyBlur(settings.opacity < 100 ? settings.blurRadius : 0);
}

let appliedRadius: number | null = null;
let pendingRadius: number | null = null;
let applying = false;

/**
 * Blurs the desktop behind the window by `radius` (0 = off). On macOS the
 * strength is adjustable (as in iTerm2, kitty and Ghostty); elsewhere it's
 * the system's own blur, on or off (Acrylic on Windows 10 and 11). Slider
 * drags are coalesced so only the latest value is sent.
 */
async function applyBlur(radius: number) {
  if (!insideNovaApp) return;
  pendingRadius = radius;
  if (applying) return;
  applying = true;
  try {
    while (pendingRadius !== null && pendingRadius !== appliedRadius) {
      const next = pendingRadius;
      pendingRadius = null;
      try {
        if (isMac) {
          await invoke("set_blur_radius", { radius: next });
        } else {
          await getCurrentWindow().setEffects(
            next > 0
              ? { effects: [isWindows ? Effect.Acrylic : Effect.Blur], state: EffectState.FollowsWindowActiveState }
              : { effects: [] },
          );
        }
        appliedRadius = next;
      } catch (err) {
        appliedRadius = next; // don't retry a value the system refused
        console.warn("Nova: background blur unavailable", err);
      }
    }
  } finally {
    applying = false;
  }
}

/**
 * xterm colours for the current theme. The background is solid at 100%
 * opacity (faded text draws cleanly) and see-through below that.
 */
export function terminalTheme(settings: Settings, hideCursor: boolean): ITheme {
  const theme = themeById(settings.themeId).terminal;
  const alpha = Math.min(100, Math.max(50, settings.opacity)) / 100;
  const base = { ...theme, background: alpha >= 1 ? theme.background : rgba(theme.background, alpha) };
  return hideCursor ? { ...base, cursor: "rgba(0, 0, 0, 0)", cursorAccent: "rgba(0, 0, 0, 0)" } : base;
}
