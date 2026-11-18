import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { isWindows } from "../lib/platform";
import { BUILTINS, SPECS } from "./specs";

/** PowerShell's own keywords (not commands you could find on PATH). */
const PS_KEYWORDS = [
  "if", "else", "elseif", "foreach", "for", "while", "do", "until", "switch", "function", "filter", "param",
  "begin", "process", "end", "try", "catch", "finally", "throw", "trap", "return", "break", "continue",
  "exit", "class", "enum", "using", "data", "dynamicparam",
];

interface CompletionData {
  /** The shell's PATH, reported by the zsh integration. */
  pathVar: string | null;
  commands: string[];
  aliases: string[];
  /** PowerShell's cmdlets and functions (Get-ChildItem, ...), sent by its integration. */
  shellCommands: string[];
  /** Every valid command name, for colouring (null until PATH is known).
   *  Lower case on Windows, where names ignore case. */
  known: Set<string> | null;
  /** Commands from your shell's own history file (~/.zsh_history), oldest first. */
  shellHistory: string[];
  histFile: string | null;
  setPath: (pathVar: string) => void;
  setHistFile: (path: string) => void;
  setAliases: (aliases: string[]) => void;
  setShellCommands: (names: string[]) => void;
}

function buildKnown(commands: string[], aliases: string[], shellCommands: string[]) {
  const names = [...commands, ...aliases, ...shellCommands, ...BUILTINS, ...SPECS.map((s) => s.name)];
  return isWindows ? new Set([...names, ...PS_KEYWORDS].map((n) => n.toLowerCase())) : new Set(names);
}

/** Whether `name` runs something. On Windows in any letter case, with or without .exe. */
export function commandKnown(known: Set<string>, name: string): boolean {
  if (!isWindows) return known.has(name);
  const lower = name.toLowerCase();
  if (known.has(lower) || known.has(lower.replace(/\.(exe|cmd|bat|com|ps1)$/, ""))) return true;
  // Cmdlet-shaped (Get-ChildItem) until PowerShell has sent its list.
  return useCompletionData.getState().shellCommands.length === 0 && /^[a-z]+-[a-z]/.test(lower);
}

export const useCompletionData = create<CompletionData>((set, get) => ({
  pathVar: null,
  commands: [],
  aliases: [],
  shellCommands: [],
  known: null,
  shellHistory: [],
  histFile: null,

  setHistFile: (path) => {
    if (path === get().histFile) return;
    set({ histFile: path });
    void invoke<string[]>("shell_history", { path })
      .then((shellHistory) => {
        if (get().histFile === path) set({ shellHistory });
      })
      .catch(() => {});
  },

  setPath: (pathVar) => {
    if (pathVar === get().pathVar) return;
    set({ pathVar });
    void invoke<string[]>("list_commands", { pathVar })
      .then((commands) => {
        if (get().pathVar !== pathVar) return;
        set({ commands, known: buildKnown(commands, get().aliases, get().shellCommands) });
      })
      .catch(() => {});
  },

  setAliases: (aliases) => {
    const { commands, known, shellCommands } = get();
    set({ aliases, known: known ? buildKnown(commands, aliases, shellCommands) : null });
  },

  setShellCommands: (shellCommands) => {
    const { commands, known, aliases } = get();
    set({ shellCommands, known: known ? buildKnown(commands, aliases, shellCommands) : null });
  },
}));

// ---- Small caches for disk lookups (refreshed every few seconds) ----------

interface DirEntry {
  name: string;
  dir: boolean;
}

interface Script {
  name: string;
  command: string;
}

function cached<T>(ttlMs: number, load: (key: string) => Promise<T>) {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = load(key).catch(() => {
      cache.delete(key);
      throw new Error("lookup failed");
    });
    cache.set(key, { at: Date.now(), value });
    return value;
  };
}

export const listDir = cached<DirEntry[]>(2000, (path) => invoke<DirEntry[]>("list_dir", { path }));
export const gitBranches = cached<string[]>(3000, (cwd) => invoke<string[]>("git_branches", { cwd }));
export const packageScripts = cached<Script[]>(5000, (cwd) => invoke<Script[]>("package_scripts", { cwd }));
