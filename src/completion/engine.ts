import { homePath, joinPath, toSlash } from "../lib/paths";
import { isWindows } from "../lib/platform";
import { gitBranches, listDir, packageScripts, useCompletionData } from "./data";
import { REDIRECTS, SEPARATORS, isAssignment, lex, unquote } from "./lexer";
import { BUILTINS, PRECOMMANDS, SPECS, specFor, type ArgKind, type Spec } from "./specs";

export type SuggestionKind =
  | "command"
  | "alias"
  | "subcommand"
  | "option"
  | "folder"
  | "file"
  | "branch"
  | "script"
  | "history";

export interface Suggestion {
  label: string;
  /** Text that replaces the word being typed. */
  insert: string;
  kind: SuggestionKind;
  description?: string;
  /** Add a space after accepting (not for folders, so you can keep going). */
  appendSpace: boolean;
  /** Replaces the whole input (past commands from history). */
  replaceAll?: boolean;
}

export interface Completion {
  /** Range of the input that a suggestion replaces. */
  start: number;
  end: number;
  items: Suggestion[];
}

interface Context {
  /** The word being typed, as written (may include quotes). */
  current: string;
  start: number;
  command: string | null;
  /** Finished words after the command name. */
  args: string[];
  /** The previous word was a redirection (`> file`). */
  redirect: boolean;
}

/** Works out what is being typed at the caret. */
function analyze(before: string): Context {
  const tokens = lex(before);
  const last = tokens[tokens.length - 1];
  const typing = last && last.kind === "word" && last.end === before.length;
  const current = typing ? last.text : "";
  const start = typing ? last.start : before.length;
  const done = typing ? tokens.slice(0, -1) : tokens;

  let words: string[] = [];
  let redirect = false;
  let skipNext = false;
  for (const t of done) {
    if (t.kind === "space" || t.kind === "comment") continue;
    if (t.kind === "operator") {
      if (SEPARATORS.has(t.text)) {
        words = [];
        redirect = false;
      } else if (REDIRECTS.has(t.text)) {
        redirect = true;
        skipNext = true;
      }
      continue;
    }
    redirect = false;
    if (skipNext) {
      skipNext = false; // the redirect target isn't an argument
      continue;
    }
    if (words.length === 0 && (isAssignment(t.text) || PRECOMMANDS.has(t.text))) continue;
    words.push(unquote(t.text));
  }

  return { current, start, command: words[0] ?? null, args: words.slice(1), redirect };
}

/** Prefix matches first, then (for 2+ letters) matches anywhere. */
function rank<T extends { label: string }>(items: T[], query: string, limit = 60): T[] {
  const q = query.toLowerCase();
  if (!q) return items.slice(0, limit);
  const prefix: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    if (label.startsWith(q)) prefix.push(item);
    // Matches in the middle only from 3 letters on ("ch" shouldn't list
    // fetch, switch and branch).
    else if (q.length >= 3 && label.includes(q)) contains.push(item);
  }
  return [...prefix, ...contains].slice(0, limit);
}

/**
 * Escapes spaces and shell characters: `My File.txt` → `My\ File.txt`
 * (PowerShell: My` File.txt, with `\` left alone as the path separator).
 */
export const escapePath = (name: string) =>
  isWindows
    ? name.replace(/([ '"()&;|<>$`{}@#,])/g, "`$1")
    : name.replace(/([ '"()&;|<>$`\\!*?[\]{}#])/g, "\\$1");

/** Where a typed path's folder part ends (PowerShell also takes `\`). */
const lastSeparator = (raw: string) => (isWindows ? Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\")) : raw.lastIndexOf("/"));

/** `/usr`, and on Windows `C:\`, `C:/` or `\\server`. */
const isAbsolute = (path: string) => path.startsWith("/") || (isWindows && (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\")));

/** Words that are clearly paths, not command names. */
export const looksLikePathWord = (word: string) =>
  word.includes("/") || word.startsWith(".") || word.startsWith("~") || (isWindows && (word.includes("\\") || /^[A-Za-z]:/.test(word)));

// ---- Sources -----------------------------------------------------------------

function commandSuggestions(query: string, history: string[]): Suggestion[] {
  const { commands, aliases, shellCommands } = useCompletionData.getState();
  // How often each command starts a line in your history.
  const used = new Map<string, number>();
  for (const line of history) {
    const first = line.trim().split(/\s+/)[0];
    if (first) used.set(first, (used.get(first) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const items: (Suggestion & { score: number })[] = [];
  const add = (name: string, kind: SuggestionKind, description?: string, bonus = 0) => {
    if (seen.has(name)) return;
    seen.add(name);
    items.push({ label: name, insert: name, kind, description, appendSpace: true, score: (used.get(name) ?? 0) * 10 + bonus });
  };
  for (const s of SPECS) add(s.name, "command", s.description, 5);
  for (const a of aliases) add(a, "alias", "alias", 3);
  for (const b of BUILTINS) add(b, "command", "shell builtin");
  for (const c of commands) add(c, "command");
  for (const c of shellCommands) add(c, "command");

  items.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return rank(items, query);
}

async function pathSuggestions(current: string, cwd: string | null, foldersOnly: boolean): Promise<Suggestion[]> {
  const raw = unquote(current);
  const slash = lastSeparator(raw);
  const dirPart = slash === -1 ? "" : raw.slice(0, slash + 1);
  const namePart = slash === -1 ? raw : raw.slice(slash + 1);
  const home = homePath();

  let base: string;
  if (isAbsolute(dirPart)) base = toSlash(dirPart);
  else if (dirPart.startsWith("~") && home) base = home + toSlash(dirPart.slice(1));
  else if (cwd) base = joinPath(cwd, toSlash(dirPart));
  else return [];

  let entries: { name: string; dir: boolean }[];
  try {
    entries = await listDir(base || "/");
  } catch {
    return [];
  }

  const showHidden = namePart.startsWith(".");
  const items: Suggestion[] = entries
    .filter((e) => (showHidden || !e.name.startsWith(".")) && (!foldersOnly || e.dir))
    .map((e) => ({
      label: e.dir ? `${e.name}/` : e.name,
      insert: escapePath(dirPart) + escapePath(e.name) + (e.dir ? "/" : ""),
      kind: e.dir ? ("folder" as const) : ("file" as const),
      appendSpace: !e.dir,
    }));
  return rank(items, namePart, 80);
}

async function branchSuggestions(cwd: string | null, query: string): Promise<Suggestion[]> {
  if (!cwd) return [];
  try {
    const branches = await gitBranches(cwd);
    return rank(
      branches.map((b) => ({ label: b, insert: b, kind: "branch" as const, appendSpace: true })),
      query,
    );
  } catch {
    return [];
  }
}

async function scriptSuggestions(cwd: string | null, query: string): Promise<Suggestion[]> {
  if (!cwd) return [];
  try {
    const scripts = await packageScripts(cwd);
    return rank(
      scripts.map((s) => ({ label: s.name, insert: s.name, kind: "script" as const, description: s.command, appendSpace: true })),
      query,
    );
  } catch {
    return [];
  }
}

function optionSuggestions(spec: Spec | undefined, subName: string | undefined, query: string): Suggestion[] {
  if (!spec) return [];
  const sub = spec.subcommands?.find((s) => s.name === subName);
  const options = [...(sub?.options ?? []), ...(spec.options ?? [])];
  return rank(
    options.map((opt) => ({ label: opt.name, insert: opt.name, kind: "option" as const, description: opt.description, appendSpace: true })),
    query,
  );
}

// ---- Entry point ---------------------------------------------------------

export interface CompleteRequest {
  text: string;
  caret: number;
  cwd: string | null;
  history: string[];
  /** Tab was pressed (show suggestions even for an empty word). */
  explicit: boolean;
}

/**
 * Suggestions for the input: matching past commands first (under a
 * "History" heading), then commands, flags, files... for the word being typed.
 */
export async function complete(req: CompleteRequest): Promise<Completion | null> {
  const past = req.explicit && req.text.trim() === "" ? [] : historyMatches(req.text, req.history);
  const words = await completeWord(req);
  if (!words && past.length === 0) return null;
  // Completions for the word come first (so ⇥ finishes the word), then
  // matching past commands. While typing, keep the word list short so the
  // history section stays in view.
  const wordItems = words?.items ?? [];
  const shownWords = past.length && !req.explicit ? wordItems.slice(0, WORDS_WITH_HISTORY) : wordItems;
  return {
    start: words?.start ?? req.caret,
    end: words?.end ?? req.caret,
    items: [...shownWords, ...past],
  };
}

const WORDS_WITH_HISTORY = 6;

const HISTORY_IN_MENU = 4;

/** Past commands containing what you've typed: starts-with first, newest first. */
export function historyMatches(text: string, history: string[]): Suggestion[] {
  const query = text.trim();
  if (query.length < 2) return [];
  const q = query.toLowerCase();
  const prefix: string[] = [];
  const contains: string[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const line = history[i];
    if (line === text) continue;
    if (line.toLowerCase().startsWith(q)) prefix.push(line);
    // Elsewhere in the line: exact case and 3+ letters, so "gi" doesn't
    // match every path containing "GITHUB".
    else if (query.length >= 3 && line.includes(query)) contains.push(line);
    if (prefix.length >= HISTORY_IN_MENU) break;
  }
  return [...prefix, ...contains].slice(0, HISTORY_IN_MENU).map((line) => ({
    label: line,
    insert: line,
    kind: "history" as const,
    appendSpace: false,
    replaceAll: true,
  }));
}

// Control characters other than tab and newline.
// eslint-disable-next-line no-control-regex
const HAS_CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/** Your shell's history plus Nova's, oldest first, newest copy of each kept. */
export function mergeHistory(shell: string[], nova: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const all = [...shell, ...nova];
  for (let i = all.length - 1; i >= 0; i--) {
    const line = all[i];
    // Skip garbled entries (stray key codes saved into the history file).
    if (seen.has(line) || HAS_CONTROL_CHARS.test(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out.reverse();
}

async function completeWord({ text, caret, cwd, history, explicit }: CompleteRequest): Promise<Completion | null> {
  const before = text.slice(0, caret);
  const ctx = analyze(before);
  const query = unquote(ctx.current);
  const at = (items: Suggestion[]): Completion | null =>
    items.length ? { start: ctx.start, end: caret, items } : null;

  // Typing a word you've already finished shouldn't keep a menu open.
  if (!explicit && ctx.current.length === 0) return null;

  // Tab on an empty line: your recent commands.
  if (explicit && text.trim() === "") {
    const recent: Suggestion[] = [];
    const seen = new Set<string>();
    for (let i = history.length - 1; i >= 0 && recent.length < 12; i--) {
      const line = history[i];
      if (seen.has(line)) continue;
      seen.add(line);
      recent.push({ label: line, insert: line, kind: "history", description: "recent", appendSpace: false });
    }
    return recent.length ? { start: 0, end: text.length, items: recent } : null;
  }

  if (ctx.redirect) return at(await pathSuggestions(ctx.current, cwd, false));

  // First word: a command (unless it's clearly a path).
  if (ctx.command === null) {
    if (looksLikePathWord(ctx.current)) {
      return at(await pathSuggestions(ctx.current, cwd, false));
    }
    return at(commandSuggestions(query, history));
  }

  const spec = specFor(ctx.command);
  const subName = spec?.subcommands ? ctx.args[0] : undefined;

  if (ctx.current.startsWith("-")) return at(optionSuggestions(spec, subName, query));

  // Second word of git / npm / docker ...: a subcommand.
  if (spec?.subcommands && ctx.args.length === 0) {
    const subs: Suggestion[] = spec.subcommands.map((s) => ({
      label: s.name,
      insert: s.name,
      kind: "subcommand",
      description: s.description,
      appendSpace: true,
    }));
    const scripts = spec.scriptsAsSubcommands ? await scriptSuggestions(cwd, query) : [];
    return at([...rank(subs, query), ...scripts]);
  }

  const sub = spec?.subcommands?.find((s) => s.name === subName);
  const kind: ArgKind = sub?.args ?? spec?.args ?? "path";
  const options = sub?.options?.length ? optionSuggestions(spec, subName, query) : [];

  switch (kind) {
    case "none":
      return at(options);
    case "folder":
      return at(await pathSuggestions(ctx.current, cwd, true));
    case "branch":
      return at([...(await branchSuggestions(cwd, query)), ...options]);
    case "script":
      return at(await scriptSuggestions(cwd, query));
    default:
      return at([...(await pathSuggestions(ctx.current, cwd, false)), ...options]);
  }
}

/** Fish-style suggestion: the newest history entry that starts with `text`. */
export function historyHint(text: string, history: string[]): string {
  if (!text.trim() || text.includes("\n")) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    const line = history[i];
    if (line.length > text.length && line.startsWith(text)) return line.slice(text.length);
  }
  return "";
}
