import type { ITheme } from "@xterm/xterm";

export interface NovaTheme {
  id: string;
  name: string;
  dark: boolean;
  /** Highlight colour for the app chrome (active tab, cursor, selection). */
  accent: string;
  terminal: ITheme & { background: string; foreground: string };
}

type Palette = [string, string, string, string, string, string, string, string];

/** Builds a theme from its 16 ANSI colours. */
function theme(
  id: string,
  name: string,
  dark: boolean,
  accent: string,
  background: string,
  foreground: string,
  normal: Palette,
  bright: Palette,
): NovaTheme {
  const [black, red, green, yellow, blue, magenta, cyan, white] = normal;
  const [brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] =
    bright;
  return {
    id,
    name,
    dark,
    accent,
    terminal: {
      background,
      foreground,
      cursor: accent,
      cursorAccent: background,
      selectionBackground: `${accent}59`,
      selectionInactiveBackground: `${accent}2e`,
      black,
      red,
      green,
      yellow,
      blue,
      magenta,
      cyan,
      white,
      brightBlack,
      brightRed,
      brightGreen,
      brightYellow,
      brightBlue,
      brightMagenta,
      brightCyan,
      brightWhite,
    },
  };
}

export const themes: NovaTheme[] = [
  theme("nova-dark", "Nova Dark", true, "#8B6CFF", "#0E0F13", "#D7DAE0",
    ["#1C1E26", "#FF5C7A", "#3DDC97", "#F5C451", "#5AA9FF", "#B48CFF", "#22D3EE", "#C9CDD6"],
    ["#5B6072", "#FF7A93", "#5EF0B0", "#FFD878", "#82BEFF", "#C9A8FF", "#5EE5F5", "#FFFFFF"]),
  theme("nova-light", "Nova Light", false, "#6D4AFF", "#F8F8FB", "#272A33",
    ["#272A33", "#D6264B", "#0F8A5F", "#A86A00", "#1F6FD6", "#7C3AED", "#0E8BA3", "#8A8F9E"],
    ["#5B6072", "#E8456A", "#16A673", "#C78300", "#3B87EB", "#9157F5", "#16A3BD", "#B4B8C4"]),
  theme("dracula", "Dracula", true, "#BD93F9", "#282A36", "#F8F8F2",
    ["#21222C", "#FF5555", "#50FA7B", "#F1FA8C", "#BD93F9", "#FF79C6", "#8BE9FD", "#F8F8F2"],
    ["#6272A4", "#FF6E6E", "#69FF94", "#FFFFA5", "#D6ACFF", "#FF92DF", "#A4FFFF", "#FFFFFF"]),
  theme("tokyo-night", "Tokyo Night", true, "#7AA2F7", "#1A1B26", "#C0CAF5",
    ["#15161E", "#F7768E", "#9ECE6A", "#E0AF68", "#7AA2F7", "#BB9AF7", "#7DCFFF", "#A9B1D6"],
    ["#414868", "#F7768E", "#9ECE6A", "#E0AF68", "#7AA2F7", "#BB9AF7", "#7DCFFF", "#C0CAF5"]),
  theme("catppuccin-mocha", "Catppuccin Mocha", true, "#CBA6F7", "#1E1E2E", "#CDD6F4",
    ["#45475A", "#F38BA8", "#A6E3A1", "#F9E2AF", "#89B4FA", "#F5C2E7", "#94E2D5", "#BAC2DE"],
    ["#585B70", "#F38BA8", "#A6E3A1", "#F9E2AF", "#89B4FA", "#F5C2E7", "#94E2D5", "#A6ADC8"]),
  theme("one-dark", "One Dark", true, "#61AFEF", "#282C34", "#ABB2BF",
    ["#282C34", "#E06C75", "#98C379", "#E5C07B", "#61AFEF", "#C678DD", "#56B6C2", "#ABB2BF"],
    ["#5C6370", "#E06C75", "#98C379", "#E5C07B", "#61AFEF", "#C678DD", "#56B6C2", "#FFFFFF"]),
  theme("github-dark", "GitHub Dark", true, "#58A6FF", "#0D1117", "#E6EDF3",
    ["#484F58", "#FF7B72", "#3FB950", "#D29922", "#58A6FF", "#BC8CFF", "#39C5CF", "#B1BAC4"],
    ["#6E7681", "#FFA198", "#56D364", "#E3B341", "#79C0FF", "#D2A8FF", "#56D4DD", "#FFFFFF"]),
  theme("nord", "Nord", true, "#88C0D0", "#2E3440", "#D8DEE9",
    ["#3B4252", "#BF616A", "#A3BE8C", "#EBCB8B", "#81A1C1", "#B48EAD", "#88C0D0", "#E5E9F0"],
    ["#4C566A", "#BF616A", "#A3BE8C", "#EBCB8B", "#81A1C1", "#B48EAD", "#8FBCBB", "#ECEFF4"]),
  theme("gruvbox-dark", "Gruvbox Dark", true, "#FABD2F", "#282828", "#EBDBB2",
    ["#282828", "#CC241D", "#98971A", "#D79921", "#458588", "#B16286", "#689D6A", "#A89984"],
    ["#928374", "#FB4934", "#B8BB26", "#FABD2F", "#83A598", "#D3869B", "#8EC07C", "#EBDBB2"]),
  theme("solarized-dark", "Solarized Dark", true, "#268BD2", "#002B36", "#839496",
    ["#073642", "#DC322F", "#859900", "#B58900", "#268BD2", "#D33682", "#2AA198", "#EEE8D5"],
    ["#586E75", "#CB4B16", "#586E75", "#657B83", "#839496", "#6C71C4", "#93A1A1", "#FDF6E3"]),
  theme("github-light", "GitHub Light", false, "#0969DA", "#FFFFFF", "#1F2328",
    ["#24292F", "#CF222E", "#116329", "#4D2D00", "#0969DA", "#8250DF", "#1B7C83", "#6E7781"],
    ["#57606A", "#A40E26", "#1A7F37", "#633C01", "#218BFF", "#A475F9", "#3192AA", "#8C959F"]),
];

export const DEFAULT_THEME_ID = "nova-dark";

export const themeById = (id: string): NovaTheme =>
  themes.find((t) => t.id === id) ?? themes[0];
