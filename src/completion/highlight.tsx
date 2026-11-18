import type { ReactNode } from "react";
import { PRECOMMANDS } from "./specs";
import { REDIRECTS, SEPARATORS, isAssignment, lex } from "./lexer";
import { isWindows } from "../lib/platform";

export type Role =
  | "command"
  | "unknown-command"
  | "option"
  | "string"
  | "variable"
  | "operator"
  | "path"
  | "comment"
  | "argument";

/** Colours come from the active theme's ANSI palette (set in appearance.ts). */
const STYLE: Record<Role, string> = {
  command: "text-[var(--nova-ansi-green)]",
  "unknown-command": "text-[var(--nova-ansi-red)] underline decoration-wavy decoration-[var(--nova-ansi-red)] underline-offset-[3px]",
  option: "text-[var(--nova-ansi-cyan)]",
  string: "text-[var(--nova-ansi-yellow)]",
  variable: "text-[var(--nova-ansi-magenta)]",
  operator: "text-[var(--nova-accent)]",
  path: "text-[var(--nova-ansi-blue)]",
  comment: "italic text-[var(--nova-faint)]",
  argument: "text-[var(--nova-text)]",
};

const looksLikePath = (w: string) =>
  w.includes("/") || w.startsWith("~") || w.startsWith(".") || (isWindows && (w.includes("\\") || /^[A-Za-z]:/.test(w)));

/**
 * Splits a command into coloured spans. `isKnown` decides whether a command
 * name exists (green) or not (red, underlined) — `null` when not loaded yet.
 */
export function highlight(src: string, isKnown: ((name: string) => boolean) | null): ReactNode[] {
  const out: ReactNode[] = [];
  let expectCommand = true;
  let expectFile = false;

  for (const token of lex(src)) {
    const key = token.start;
    if (token.kind === "space") {
      out.push(token.text);
      continue;
    }
    if (token.kind === "comment") {
      out.push(<span key={key} className={STYLE.comment}>{token.text}</span>);
      continue;
    }
    if (token.kind === "operator") {
      if (token.text === "\n") {
        out.push("\n");
      } else {
        out.push(<span key={key} className={STYLE.operator}>{token.text}</span>);
      }
      if (SEPARATORS.has(token.text)) expectCommand = true;
      if (REDIRECTS.has(token.text)) expectFile = true;
      continue;
    }

    const w = token.text;
    let role: Role;
    if (expectFile) {
      role = "path";
      expectFile = false;
    } else if (expectCommand && isAssignment(w)) {
      role = "variable";
    } else if (expectCommand) {
      const name = w.replace(/^\\/, "");
      const known = isKnown === null || looksLikePath(name) || name.startsWith("$") || isKnown(name);
      // Still typing this word (nothing after it yet)? Don't flag it red.
      const typing = token.end === src.length;
      role = known ? "command" : typing ? "argument" : "unknown-command";
      if (!PRECOMMANDS.has(name)) expectCommand = false;
    } else if (w.startsWith("-")) {
      role = "option";
    } else if (w.startsWith("'") || w.startsWith('"')) {
      role = "string";
    } else if (w.startsWith("$")) {
      role = "variable";
    } else if (looksLikePath(w)) {
      role = "path";
    } else {
      role = "argument";
    }
    out.push(<span key={key} className={STYLE[role]}>{w}</span>);
  }
  return out;
}
