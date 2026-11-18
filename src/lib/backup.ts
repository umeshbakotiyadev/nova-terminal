import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import { DEFAULT_SETTINGS, migrateSettings, useSettings, type Settings } from "../stores/settings";
import { snapshotLayouts, useTabs } from "../stores/tabs";
import type { SavedLayout } from "../stores/layout";

/**
 * One file with everything that makes Nova yours: settings, open tabs with
 * their split layouts, command history and recent folders. Plain JSON, so it
 * can be kept in a dotfiles repo or shared with a teammate.
 */
export interface NovaBackup {
  app: "nova-terminal";
  format: 1;
  exportedAt: string;
  settings?: Partial<Settings>;
  tabs?: SavedLayout[];
  history?: string[];
  recentDirs?: string[];
}

export interface BackupParts {
  settings: boolean;
  tabs: boolean;
  history: boolean;
  recentDirs: boolean;
}

const FILTERS = [{ name: "Nova Terminal backup", extensions: ["json"] }];

/** Settings without the window-only state (like whether Settings is open). */
function currentSettings(): Settings {
  const all = useSettings.getState() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = all[key];
  return out as unknown as Settings;
}

export function buildBackup(parts: BackupParts): NovaBackup {
  const state = useTabs.getState();
  return {
    app: "nova-terminal",
    format: 1,
    exportedAt: new Date().toISOString(),
    ...(parts.settings ? { settings: currentSettings() } : {}),
    ...(parts.tabs ? { tabs: snapshotLayouts() } : {}),
    ...(parts.history ? { history: state.history } : {}),
    ...(parts.recentDirs ? { recentDirs: state.recentDirs } : {}),
  };
}

/** Asks where to save, then writes the backup. Returns the path, or null if cancelled. */
export async function exportBackup(parts: BackupParts): Promise<string | null> {
  const day = new Date().toISOString().slice(0, 10);
  const path = await save({ defaultPath: `nova-terminal-backup-${day}.json`, filters: FILTERS });
  if (!path) return null;
  await invoke("write_text_file", { path, contents: JSON.stringify(buildBackup(parts), null, 2) });
  return path;
}

/** Asks for a backup file and reads it. Returns null if cancelled. */
export async function pickBackup(): Promise<NovaBackup | null> {
  const picked = await open({ multiple: false, directory: false, filters: FILTERS });
  const path = Array.isArray(picked) ? picked[0] : picked;
  if (!path) return null;
  const text = await invoke<string>("read_text_file", { path });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const backup = data as Partial<NovaBackup> | null;
  if (!backup || backup.app !== "nova-terminal") {
    throw new Error("That file isn't a Nova Terminal backup.");
  }
  return backup as NovaBackup;
}

/** Only known settings with the right type are taken from a file. */
function cleanSettings(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== "object") return {};
  const source = migrateSettings(raw as Record<string, unknown>);
  const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    if (key in source && typeof source[key] === typeof fallback) out[key] = source[key];
  }
  return out as Partial<Settings>;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** What a backup file contains, for the import summary. */
export function describeBackup(backup: NovaBackup) {
  return {
    exportedAt: backup.exportedAt ? new Date(backup.exportedAt) : null,
    settings: Object.keys(cleanSettings(backup.settings)).length,
    tabs: Array.isArray(backup.tabs) ? backup.tabs.length : 0,
    history: strings(backup.history).length,
    recentDirs: strings(backup.recentDirs).length,
  };
}

/** Applies the chosen parts. Tabs open next to your current ones; nothing is closed. */
export function applyBackup(backup: NovaBackup, parts: BackupParts): { tabsOpened: number } {
  if (parts.settings) useSettings.getState().update(cleanSettings(backup.settings));
  if (parts.history) useTabs.getState().importHistory(strings(backup.history));
  if (parts.recentDirs) useTabs.getState().importRecentDirs(strings(backup.recentDirs));
  let tabsOpened = 0;
  if (parts.tabs && Array.isArray(backup.tabs)) tabsOpened = useTabs.getState().openSavedLayouts(backup.tabs);
  return { tabsOpened };
}
