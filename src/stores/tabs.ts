import { create } from "zustand";
import { loadSettings, useSettings } from "./settings";
import {
  insertBeside,
  pane,
  paneIds,
  removePane,
  restoreLayout,
  saveLayout,
  setSizes,
  type Dir,
  type Group,
  type SavedLayout,
} from "./layout";

/**
 * One shell session. Historically called a "tab"; with split panes a tab
 * (a `Group`) can hold several of these side by side.
 */
export interface Tab {
  id: string;
  /** Folder the shell starts in (inherited from the tab that was active). */
  initialCwd: string | null;
  /** Title set by a program (OSC 0/2), used when the folder is unknown. */
  title: string | null;
  /** A name you gave the tab (double-click to rename); null = automatic. */
  customName: string | null;
  /** Current folder, reported by the shell integration (OSC 7). */
  cwd: string | null;
  branch: string | null;
  /** Exit code of the last finished command. */
  lastExit: number | null;
  /** A command is running (between OSC 133 C and D). */
  running: boolean;
  runningCommand: string | null;
  /** The shell integration is active, so Nova's input box can be used. */
  integrated: boolean;
  /** A full-screen app (vim, htop, less...) is using the alternate screen. */
  altScreen: boolean;
  /** Something has been printed (hides the empty-pane welcome hint). */
  hasOutput: boolean;
}

export type { Group } from "./layout";

/** Colours a tab group can have (drawn from the theme's palette). */
export const SECTION_COLORS = ["purple", "blue", "cyan", "green", "yellow", "red"] as const;
export type SectionColor = (typeof SECTION_COLORS)[number];

/** CSS colour for a tab group. */
export const sectionColor = (color: SectionColor) =>
  `var(--nova-ansi-${color === "purple" ? "magenta" : color})`;

/**
 * A named, coloured group of tabs in the tabs panel (e.g. one per project).
 * Called a "section" in code, since a split tab is already a `Group`.
 */
export interface Section {
  id: string;
  name: string;
  color: SectionColor;
  collapsed: boolean;
}

const SESSION_KEY = "nova.session";
const HISTORY_KEY = "nova.history";
const RECENT_DIRS_KEY = "nova.recentDirs";
const HISTORY_LIMIT = 1000;
const RECENT_DIRS_LIMIT = 30;

interface TabsState {
  /** Every shell session, in no particular order (groups decide layout). */
  tabs: Tab[];
  /** Tabs as shown in the tab bar, each with its split layout. Always kept
   *  in display order: grouped tabs first (group by group), then the rest. */
  groups: Group[];
  /** Tab groups, in display order. */
  sections: Section[];
  /** The tab group whose name is being edited. */
  editingSectionId: string | null;
  /** The focused session. */
  activeId: string;
  sidebarOpen: boolean;
  sidebarWidth: number;
  paletteOpen: boolean;
  /** The tab whose name is being edited. */
  renamingId: string | null;
  history: string[];
  /** Folders you've been in, newest first (for the folder picker). */
  recentDirs: string[];
  /**
   * Unsent text in each session's input box. Kept apart from `tabs` so
   * typing doesn't redraw the tabs panel and top bar on every key.
   */
  drafts: Record<string, string>;
  setDraft: (id: string, text: string) => void;
  addTab: () => void;
  /** Splits the focused pane: "row" = side by side (⌘D), "column" = stacked (⌘⇧D). */
  splitActive: (dir: Dir) => void;
  /** Closes one session (pane). Closing a tab's last pane closes the tab. */
  closeTab: (id: string) => void;
  /** Closes a whole tab with all its panes. */
  closeGroup: (groupId: string) => void;
  setActive: (id: string) => void;
  setActiveIndex: (index: number) => void;
  /** Next / previous tab. */
  cycle: (step: 1 | -1) => void;
  /** Next / previous pane inside the current tab. */
  focusPane: (step: 1 | -1) => void;
  patchTab: (id: string, patch: Partial<Tab>) => void;
  toggleSidebar: () => void;
  /** New tab order, as a list of group ids (drag to reorder). */
  reorderGroups: (ids: string[]) => void;
  setSplitSizes: (splitId: string, sizes: number[]) => void;
  renameTab: (id: string, name: string) => void;
  setRenaming: (id: string | null) => void;
  setSidebarWidth: (width: number) => void;
  setPaletteOpen: (open: boolean) => void;
  pushHistory: (command: string) => void;
  rememberDir: (path: string) => void;
  /** Opens tabs (with their splits) from a backup, after the current ones. */
  openSavedLayouts: (layouts: SavedLayout[]) => number;
  /** Merges commands / folders from a backup into yours. */
  importHistory: (commands: string[]) => void;
  importRecentDirs: (folders: string[]) => void;

  /** New tab group, optionally starting with a tab (by session id). Returns its id. */
  addSection: (withTabId?: string) => string;
  renameSection: (id: string, name: string) => void;
  setEditingSection: (id: string | null) => void;
  setSectionColor: (id: string, color: SectionColor) => void;
  toggleSection: (id: string, collapsed?: boolean) => void;
  /** Removes the group but keeps its tabs (they become ungrouped). */
  ungroupSection: (id: string) => void;
  /** Closes every tab in the group, and the group. */
  closeSection: (id: string) => void;
  /** Files a tab (by session id) under a group, or ungroups it (null). */
  moveToSection: (tabId: string, sectionId: string | null) => void;
  /** New tab inside a group. */
  addTabToSection: (sectionId: string) => void;
  /**
   * Applies a drag in the tabs panel. `keys` is the panel's list in its new
   * order: "s:<section>" headers, "g:<tab>" rows and "loose" (the start of
   * the ungrouped tabs). A row belongs to the nearest header above it.
   */
  applyPanelOrder: (keys: string[]) => void;
}

let counter = 0;
let groupCounter = 0;

const newTab = (initialCwd: string | null = null, customName: string | null = null): Tab => ({
  id: `tab-${++counter}`,
  initialCwd,
  title: null,
  customName,
  cwd: null,
  branch: null,
  lastExit: null,
  running: false,
  runningCommand: null,
  integrated: false,
  altScreen: false,
  hasOutput: false,
});

const newGroup = (tabId: string, sectionId: string | null = null): Group => ({
  id: `group-${++groupCounter}`,
  layout: pane(tabId),
  focusedId: tabId,
  sectionId,
});

let sectionCounter = 0;

/**
 * Display order: each tab group's tabs together (groups in order), then the
 * ungrouped tabs. Tabs filed under a group that no longer exists are ungrouped.
 */
function arrange(groups: Group[], sections: Section[]): Group[] {
  const known = new Set(sections.map((s) => s.id));
  const grouped = sections.flatMap((section) => groups.filter((g) => g.sectionId === section.id));
  const loose = groups
    .filter((g) => !g.sectionId || !known.has(g.sectionId))
    .map((g) => (g.sectionId ? { ...g, sectionId: null } : g));
  return [...grouped, ...loose];
}

/** The tab (group) that holds a session. */
export const groupOf = (groups: Group[], tabId: string) => groups.find((g) => paneIds(g.layout).includes(tabId));

function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage unavailable: kept for this session only */
  }
}

interface SavedSession {
  groups?: SavedLayout[];
  /** Tab groups, and which one each saved tab was in (index, or null). */
  sections?: { name: string; color: SectionColor; collapsed: boolean }[];
  sectionOf?: (number | null)[];
  activeGroup?: number;
  /** Older format: one folder per tab. */
  folders?: (string | null)[];
  names?: (string | null)[];
  active?: number;
  sidebarOpen?: boolean;
  sidebarWidth?: number;
}

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 440;
const clampWidth = (w: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));

/** Reopens the tabs, their split layouts and folders from the last time Nova ran. */
function initialSession() {
  let saved: SavedSession | null = null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    saved = raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    saved = null;
  }
  const sidebarOpen = saved?.sidebarOpen ?? true;
  const sidebarWidth = clampWidth(saved?.sidebarWidth ?? 280);

  const tabs: Tab[] = [];
  const makePane = (folder: string | null, name: string | null) => {
    const tab = newTab(typeof folder === "string" ? folder : null, typeof name === "string" ? name : null);
    tabs.push(tab);
    return tab.id;
  };

  let groups: Group[] = [];
  let sections: Section[] = [];
  let activeGroup = 0;
  if (saved && loadSettings().restoreSession) {
    if (Array.isArray(saved.groups) && saved.groups.length > 0) {
      if (Array.isArray(saved.sections)) {
        sections = saved.sections.map((s) => ({
          id: `section-${++sectionCounter}`,
          name: typeof s?.name === "string" && s.name.trim() ? s.name : "Group",
          color: SECTION_COLORS.includes(s?.color) ? s.color : "purple",
          collapsed: !!s?.collapsed,
        }));
      }
      groups = saved.groups.map((layout, i) => {
        const restored = restoreLayout(layout, makePane);
        const index = saved?.sectionOf?.[i];
        const sectionId = typeof index === "number" ? sections[index]?.id ?? null : null;
        return { id: `group-${++groupCounter}`, layout: restored, focusedId: paneIds(restored)[0], sectionId };
      });
      activeGroup = saved.activeGroup ?? 0;
    } else if (Array.isArray(saved.folders) && saved.folders.length > 0) {
      groups = saved.folders.map((folder, i) => newGroup(makePane(folder, saved?.names?.[i] ?? null)));
      activeGroup = saved.active ?? 0;
    }
  }
  if (groups.length === 0) {
    groups = [newGroup(makePane(null, null))];
    activeGroup = 0;
  }
  const group = groups[Math.min(Math.max(activeGroup, 0), groups.length - 1)];
  return { tabs, groups: arrange(groups, sections), sections, activeId: group.focusedId, sidebarOpen, sidebarWidth };
}

const session = initialSession();

export const useTabs = create<TabsState>((set, get) => ({
  tabs: session.tabs,
  groups: session.groups,
  sections: session.sections,
  editingSectionId: null,
  activeId: session.activeId,
  sidebarOpen: session.sidebarOpen,
  sidebarWidth: session.sidebarWidth,
  paletteOpen: false,
  renamingId: null,
  history: loadList(HISTORY_KEY),
  recentDirs: loadList(RECENT_DIRS_KEY),
  drafts: {},

  setDraft: (id, text) => set((s) => ({ drafts: { ...s.drafts, [id]: text } })),

  addTab: () => {
    const { tabs, groups, activeId } = get();
    // New tabs open in the same folder as the current one
    // (or in your home folder, if you chose that in Settings).
    const current = tabs.find((t) => t.id === activeId);
    const inherit = useSettings.getState().newTabFolder === "current";
    const tab = newTab(inherit ? current?.cwd ?? null : null);
    // Opens right after the current tab, in the same tab group.
    const currentGroup = groupOf(groups, activeId);
    const group = newGroup(tab.id, currentGroup?.sectionId ?? null);
    const at = currentGroup ? groups.indexOf(currentGroup) : -1;
    const next = [...groups];
    next.splice(at === -1 ? next.length : at + 1, 0, group);
    set({ tabs: [...tabs, tab], groups: arrange(next, get().sections), activeId: tab.id });
  },

  splitActive: (dir) => {
    const { tabs, groups, activeId } = get();
    const group = groupOf(groups, activeId);
    if (!group) return;
    // Don't split a pane into halves too small to use.
    const pane = document.querySelector<HTMLElement>(`[data-pane="${activeId}"]`)?.getBoundingClientRect();
    if (pane && (dir === "row" ? pane.width / 2 < MIN_PANE_WIDTH : pane.height / 2 < MIN_PANE_HEIGHT)) return;
    // A split always starts in the focused pane's folder.
    const current = tabs.find((t) => t.id === activeId);
    const tab = newTab(current?.cwd ?? current?.initialCwd ?? null);
    const layout = insertBeside(group.layout, activeId, tab.id, dir);
    set({
      tabs: [...tabs, tab],
      groups: groups.map((g) => (g.id === group.id ? { ...g, layout, focusedId: tab.id } : g)),
      activeId: tab.id,
    });
  },

  closeTab: (id) => {
    const { tabs, groups, activeId } = get();
    const group = groupOf(groups, id);
    if (!group) return;
    const groupIndex = groups.indexOf(group);
    const layout = removePane(group.layout, id);
    const remainingTabs = tabs.filter((t) => t.id !== id);

    let nextGroups: Group[];
    if (layout) {
      const ids = paneIds(layout);
      // Focus moves to the pane that sat next to the closed one.
      const oldIds = paneIds(group.layout);
      const neighbour = ids[Math.min(oldIds.indexOf(id), ids.length - 1)] ?? ids[0];
      const focusedId = group.focusedId === id ? neighbour : group.focusedId;
      nextGroups = groups.map((g) => (g.id === group.id ? { ...g, layout, focusedId } : g));
    } else {
      nextGroups = groups.filter((g) => g.id !== group.id);
    }

    if (nextGroups.length === 0) {
      // Closing the last tab starts a fresh one instead of leaving an empty window.
      const tab = newTab();
      set({ tabs: [tab], groups: [newGroup(tab.id)], activeId: tab.id });
      return;
    }

    let nextActive = activeId;
    if (activeId === id) {
      const sameGroup = nextGroups.find((g) => g.id === group.id);
      nextActive = sameGroup
        ? sameGroup.focusedId
        : nextGroups[Math.min(groupIndex, nextGroups.length - 1)].focusedId;
    }
    set({ tabs: remainingTabs, groups: nextGroups, activeId: nextActive });
  },

  closeGroup: (groupId) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group) return;
    for (const id of paneIds(group.layout)) get().closeTab(id);
  },

  setActive: (id) =>
    set((s) => ({
      activeId: id,
      groups: s.groups.map((g) => (paneIds(g.layout).includes(id) ? { ...g, focusedId: id } : g)),
    })),

  setActiveIndex: (index) => {
    const { groups } = get();
    // Cmd+9 always jumps to the last tab, like in browsers.
    const group = index >= 8 ? groups[groups.length - 1] : groups[index];
    if (group) set({ activeId: group.focusedId });
  },

  cycle: (step) => {
    const { groups, activeId } = get();
    const index = groups.findIndex((g) => g.id === groupOf(groups, activeId)?.id);
    const next = groups[(index + step + groups.length) % groups.length];
    if (next) set({ activeId: next.focusedId });
  },

  focusPane: (step) => {
    const { groups, activeId } = get();
    const group = groupOf(groups, activeId);
    if (!group) return;
    const ids = paneIds(group.layout);
    const next = ids[(ids.indexOf(activeId) + step + ids.length) % ids.length];
    get().setActive(next);
  },

  patchTab: (id, patch) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  reorderGroups: (ids) =>
    set((s) => {
      const byId = new Map(s.groups.map((g) => [g.id, g]));
      const ordered = ids.map((id) => byId.get(id)).filter((g): g is Group => !!g);
      // Keep any tab missing from `ids` (e.g. hidden by a search) at the end.
      const rest = s.groups.filter((g) => !ids.includes(g.id));
      // Tabs stay with their tab group.
      return { groups: arrange([...ordered, ...rest], s.sections) };
    }),

  setSplitSizes: (splitId, sizes) =>
    set((s) => ({ groups: s.groups.map((g) => ({ ...g, layout: setSizes(g.layout, splitId, sizes) })) })),

  renameTab: (id, name) => {
    const customName = name.trim() || null;
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, customName } : t)),
      renamingId: null,
    }));
  },

  setRenaming: (id) => set({ renamingId: id }),

  setSidebarWidth: (width) => set({ sidebarWidth: clampWidth(width) }),

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  pushHistory: (command) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    const history = [...get().history.filter((c) => c !== trimmed), trimmed].slice(-HISTORY_LIMIT);
    saveList(HISTORY_KEY, history);
    set({ history });
  },

  openSavedLayouts: (layouts) => {
    const created: Tab[] = [];
    const makePane = (folder: string | null, name: string | null) => {
      const tab = newTab(typeof folder === "string" ? folder : null, typeof name === "string" ? name : null);
      created.push(tab);
      return tab.id;
    };
    const added: Group[] = layouts.map((saved) => {
      const layout = restoreLayout(saved, makePane);
      return { id: `group-${++groupCounter}`, layout, focusedId: paneIds(layout)[0], sectionId: null };
    });
    if (added.length === 0) return 0;
    set((s) => ({
      tabs: [...s.tabs, ...created],
      groups: [...s.groups, ...added],
      activeId: added[0].focusedId,
    }));
    return added.length;
  },

  importHistory: (commands) => {
    const seen = new Set<string>();
    const merged = [...get().history, ...commands]
      .reverse()
      .filter((c) => typeof c === "string" && c.trim() && !seen.has(c) && !!seen.add(c))
      .reverse()
      .slice(-HISTORY_LIMIT);
    saveList(HISTORY_KEY, merged);
    set({ history: merged });
  },

  importRecentDirs: (folders) => {
    const seen = new Set<string>();
    const merged = [...get().recentDirs, ...folders]
      .filter((d) => typeof d === "string" && d && !seen.has(d) && !!seen.add(d))
      .slice(0, RECENT_DIRS_LIMIT);
    saveList(RECENT_DIRS_KEY, merged);
    set({ recentDirs: merged });
  },

  addSection: (withTabId) => {
    const { sections, groups } = get();
    const used = new Set(sections.map((s) => s.color));
    const color = SECTION_COLORS.find((c) => !used.has(c)) ?? SECTION_COLORS[sections.length % SECTION_COLORS.length];
    const section: Section = { id: `section-${++sectionCounter}`, name: `Group ${sections.length + 1}`, color, collapsed: false };
    const nextSections = [...sections, section];
    const target = withTabId ? groupOf(groups, withTabId) : undefined;
    const nextGroups = target
      ? groups.map((g) => (g.id === target.id ? { ...g, sectionId: section.id } : g))
      : groups;
    set({ sections: nextSections, groups: arrange(nextGroups, nextSections), editingSectionId: section.id, sidebarOpen: true });
    return section.id;
  },

  renameSection: (id, name) =>
    set((s) => ({
      sections: s.sections.map((x) => (x.id === id && name.trim() ? { ...x, name: name.trim() } : x)),
      editingSectionId: null,
    })),

  setEditingSection: (id) => set({ editingSectionId: id }),

  setSectionColor: (id, color) =>
    set((s) => ({ sections: s.sections.map((x) => (x.id === id ? { ...x, color } : x)) })),

  toggleSection: (id, collapsed) =>
    set((s) => ({
      sections: s.sections.map((x) => (x.id === id ? { ...x, collapsed: collapsed ?? !x.collapsed } : x)),
    })),

  ungroupSection: (id) =>
    set((s) => {
      const sections = s.sections.filter((x) => x.id !== id);
      return { sections, groups: arrange(s.groups, sections) };
    }),

  closeSection: (id) => {
    for (const group of get().groups.filter((g) => g.sectionId === id)) get().closeGroup(group.id);
    get().ungroupSection(id);
  },

  moveToSection: (tabId, sectionId) =>
    set((s) => {
      const target = groupOf(s.groups, tabId);
      if (!target) return {};
      // Moved to the end of its new group.
      const others = s.groups.filter((g) => g.id !== target.id);
      const sections = s.sections.map((x) => (x.id === sectionId ? { ...x, collapsed: false } : x));
      return { sections, groups: arrange([...others, { ...target, sectionId }], sections) };
    }),

  addTabToSection: (sectionId) => {
    const { tabs, groups, sections } = get();
    const inherit = useSettings.getState().newTabFolder === "current";
    // Starts in the folder of the group's last tab (or the current one).
    const last = [...groups].reverse().find((g) => g.sectionId === sectionId);
    const from = tabs.find((t) => t.id === (last?.focusedId ?? get().activeId));
    const tab = newTab(inherit ? from?.cwd ?? null : null);
    const nextSections = sections.map((x) => (x.id === sectionId ? { ...x, collapsed: false } : x));
    set({
      tabs: [...tabs, tab],
      sections: nextSections,
      groups: arrange([...groups, newGroup(tab.id, sectionId)], nextSections),
      activeId: tab.id,
    });
  },

  applyPanelOrder: (keys) =>
    set((s) => {
      const headerIds = keys.filter((k) => k.startsWith("s:")).map((k) => k.slice(2));
      const sections = [
        ...headerIds.map((id) => s.sections.find((x) => x.id === id)).filter((x): x is Section => !!x),
        ...s.sections.filter((x) => !headerIds.includes(x.id)),
      ];
      // A row belongs to the nearest header above it (rows dragged above
      // every header join the first group).
      let current: string | null = sections[0]?.id ?? null;
      const placed = new Map<string, string | null>();
      const order: string[] = [];
      for (const key of keys) {
        if (key.startsWith("s:")) current = key.slice(2);
        else if (key === "loose") current = null;
        else if (key.startsWith("g:")) {
          placed.set(key.slice(2), current);
          order.push(key.slice(2));
        }
      }
      const byId = new Map(s.groups.map((g) => [g.id, g]));
      const moved = order
        .map((id) => byId.get(id))
        .filter((g): g is Group => !!g)
        .map((g) => ({ ...g, sectionId: placed.get(g.id) ?? null }));
      // Tabs not in the list (inside collapsed groups) keep their group and place.
      const unlisted = s.groups.filter((g) => !placed.has(g.id));
      return { sections, groups: arrange([...unlisted, ...moved], sections) };
    }),

  rememberDir: (path) => {
    const current = get().recentDirs;
    if (current[0] === path) return;
    const recentDirs = [path, ...current.filter((d) => d !== path)].slice(0, RECENT_DIRS_LIMIT);
    saveList(RECENT_DIRS_KEY, recentDirs);
    set({ recentDirs });
  },
}));

// Switching to a tab inside a collapsed tab group opens the group, so the
// active tab is always visible in the tabs panel.
useTabs.subscribe((s, prev) => {
  if (s.activeId === prev.activeId) return;
  const sectionId = groupOf(s.groups, s.activeId)?.sectionId;
  if (sectionId && s.sections.find((x) => x.id === sectionId)?.collapsed) s.toggleSection(sectionId, false);
});

// Remember open tabs, their splits and folders for next launch.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useTabs.subscribe((s, prev) => {
  // Typing (drafts), menus and history don't change the saved session.
  if (
    s.tabs === prev.tabs &&
    s.groups === prev.groups &&
    s.sections === prev.sections &&
    s.activeId === prev.activeId &&
    s.sidebarOpen === prev.sidebarOpen &&
    s.sidebarWidth === prev.sidebarWidth
  ) {
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const byId = new Map(s.tabs.map((t) => [t.id, t]));
    const info = (id: string) => {
      const t = byId.get(id);
      return { folder: t?.cwd ?? t?.initialCwd ?? null, name: t?.customName ?? null };
    };
    const sectionIndex = new Map(s.sections.map((x, i) => [x.id, i]));
    const data: SavedSession = {
      groups: s.groups.map((g) => saveLayout(g.layout, info)),
      sections: s.sections.map(({ name, color, collapsed }) => ({ name, color, collapsed })),
      sectionOf: s.groups.map((g) => (g.sectionId ? sectionIndex.get(g.sectionId) ?? null : null)),
      activeGroup: Math.max(0, s.groups.findIndex((g) => g.id === groupOf(s.groups, s.activeId)?.id)),
      sidebarOpen: s.sidebarOpen,
      sidebarWidth: s.sidebarWidth,
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable */
    }
  }, 300);
});

/** Current tabs and split layouts, in the saved-session format. */
export function snapshotLayouts(): SavedLayout[] {
  const s = useTabs.getState();
  const byId = new Map(s.tabs.map((t) => [t.id, t]));
  return s.groups.map((g) =>
    saveLayout(g.layout, (id) => {
      const t = byId.get(id);
      return { folder: t?.cwd ?? t?.initialCwd ?? null, name: t?.customName ?? null };
    }),
  );
}

/** Smallest pane a split may create, in pixels. */
const MIN_PANE_WIDTH = 220;
const MIN_PANE_HEIGHT = 140;

/** The focused session. */
export const useActiveTab = () => useTabs((s) => s.tabs.find((t) => t.id === s.activeId));

/** Nova's own input box is used when the shell is idle at its prompt. */
export const showsInput = (tab: Tab | undefined) =>
  !!tab && tab.integrated && !tab.running && !tab.altScreen;

/** A session's unsent input text. */
export const getDraft = (id: string) => useTabs.getState().drafts[id] ?? "";
