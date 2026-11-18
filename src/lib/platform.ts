/** Which system Nova is running on (decides keys, window chrome and shell rules). */
const platform = navigator.platform.toLowerCase();

export const isMac = platform.includes("mac");
export const isWindows = platform.startsWith("win");

/**
 * The shell's escape character: a backslash in zsh and bash, a backtick in
 * PowerShell (where `\` is the path separator).
 */
export const SHELL_ESCAPE = isWindows ? "`" : "\\";

/**
 * An app shortcut's label: "⌘D" on macOS, "Ctrl+Shift+D" elsewhere. The
 * variant (split down, previous tab) adds ⇧ on macOS and Alt elsewhere,
 * where Shift is already part of Ctrl+Shift: "⌘⇧D" / "Ctrl+Shift+Alt+D".
 */
export const appKey = (key: string, variant = false) =>
  isMac ? `⌘${variant ? "⇧" : ""}${key}` : `Ctrl+Shift+${variant ? "Alt+" : ""}${key}`;
