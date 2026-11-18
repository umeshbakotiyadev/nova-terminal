/**
 * A small shell lexer, good enough for colouring and suggestions (not a full
 * zsh or PowerShell parser). It never throws: unfinished quotes simply run
 * to the end.
 */

import { SHELL_ESCAPE as ESC } from "../lib/platform";

export type TokenKind = "space" | "word" | "operator" | "comment";

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

const OPERATORS = ["&&", "||", ";;", "|&", ">>", "<<", "&>", ">&", "|", "&", ";", ">", "<", "(", ")"];

/** Operators after which a new command starts. */
export const SEPARATORS = new Set(["&&", "||", ";;", "|&", "|", "&", ";", "(", ")", "\n"]);

/** Operators whose next word is a file, not a command. */
export const REDIRECTS = new Set([">>", "<<", "&>", ">&", ">", "<"]);

const isSpace = (c: string) => c === " " || c === "\t";
const isOperatorStart = (c: string) => "&|;<>()".includes(c);

export function lex(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, start: number, end: number) =>
    tokens.push({ kind, text: src.slice(start, end), start, end });

  while (i < src.length) {
    const c = src[i];

    // Unescaped newline separates commands.
    if (c === "\n") {
      push("operator", i, i + 1);
      i++;
      continue;
    }

    // Whitespace, including line continuations (backslash-newline, or
    // backtick-newline in PowerShell).
    if (isSpace(c) || (c === ESC && src[i + 1] === "\n")) {
      const start = i;
      while (i < src.length && (isSpace(src[i]) || (src[i] === ESC && src[i + 1] === "\n"))) {
        i += src[i] === ESC ? 2 : 1;
      }
      push("space", start, i);
      continue;
    }

    // Comments start with # at the beginning of a word.
    const prev = tokens[tokens.length - 1];
    if (c === "#" && (!prev || prev.kind !== "word")) {
      const start = i;
      while (i < src.length && src[i] !== "\n") i++;
      push("comment", start, i);
      continue;
    }

    if (isOperatorStart(c)) {
      const op = OPERATORS.find((candidate) => src.startsWith(candidate, i)) ?? c;
      push("operator", i, i + op.length);
      i += op.length;
      continue;
    }

    // A word, with quotes and escapes kept inside it.
    const start = i;
    while (i < src.length) {
      const ch = src[i];
      if (isSpace(ch) || ch === "\n" || isOperatorStart(ch)) break;
      if (ch === ESC) {
        if (src[i + 1] === "\n") break;
        i += 2;
        continue;
      }
      if (ch === "'") {
        const close = src.indexOf("'", i + 1);
        i = close === -1 ? src.length : close + 1;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        while (j < src.length && src[j] !== '"') j += src[j] === ESC ? 2 : 1;
        i = Math.min(j + 1, src.length);
        continue;
      }
      i++;
    }
    push("word", start, Math.min(i, src.length));
  }
  return tokens;
}

/** `NAME=value` at the start of a command sets a variable for it. */
export const isAssignment = (word: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);

/** Removes quotes and escapes: `"my file"` → `my file`. */
export function unquote(word: string): string {
  let out = "";
  for (let i = 0; i < word.length; i++) {
    const c = word[i];
    if (c === ESC) {
      out += word[i + 1] ?? "";
      i++;
    } else if (c !== "'" && c !== '"') {
      out += c;
    }
  }
  return out;
}
