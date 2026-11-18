import { SHELL_ESCAPE as ESC } from "../lib/platform";
import { lex } from "./lexer";

const BREAK_BEFORE = new Set(["|", "&&", "||", "|&"]);

/**
 * Makes a command easier to read (⌥⇧F):
 * - a long one-liner is split onto lines at pipes and && / ||, with `\`
 *   line continuations (a backtick in PowerShell) so it still runs as one
 *   command;
 * - a command that is already split is joined back onto one line.
 * Extra spaces outside quotes are tidied either way.
 */
export function formatCommand(src: string): string {
  const tokens = lex(src);
  const isSplit = tokens.some((t) => t.kind === "space" && t.text.includes(`${ESC}\n`));

  const parts: string[] = [];
  for (const t of tokens) {
    if (t.kind === "space") {
      parts.push(" ");
    } else if (t.kind === "operator" && t.text === "\n") {
      parts.push("\n");
    } else {
      parts.push(t.text);
    }
  }
  // Collapse runs of spaces, trim each line.
  const flat = parts
    .join("")
    .replace(/ {2,}/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  if (isSplit) return flat;

  const pieces = lex(flat);
  const breaks = pieces.filter((t) => t.kind === "operator" && BREAK_BEFORE.has(t.text)).length;
  if (breaks === 0 || (flat.length <= 80 && breaks < 2)) return flat;

  let out = "";
  for (const t of pieces) {
    if (t.kind === "operator" && BREAK_BEFORE.has(t.text)) {
      out = out.trimEnd() + ` ${ESC}\n  ` + t.text;
    } else {
      out += t.text;
    }
  }
  return out;
}
