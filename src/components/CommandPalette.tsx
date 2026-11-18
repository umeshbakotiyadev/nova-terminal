import { useEffect, useMemo, useRef, useState } from "react";
import { ArchiveRestore, ArrowRightLeft, Columns2, Command, Eraser, FolderPlus, Rows2, Palette, PanelLeft, PencilLine, Plus, Search, Settings, SquareTerminal, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useHoverIntent } from "../lib/hoverIntent";
import { fade, pop } from "../lib/motion";

import { tildify } from "../lib/paths";
import { terminals } from "../lib/registry";
import { appKey, isMac } from "../lib/platform";
import { useSettings } from "../stores/settings";
import { paneIds } from "../stores/layout";
import { useTabs } from "../stores/tabs";
import { themes } from "../themes";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const mod = isMac ? "⌘" : "Ctrl+Shift+";

/** Cmd+P: jump to any tab or run any action by typing. */
export function CommandPalette() {
  const tabs = useTabs((s) => s.tabs);
  const close = () => useTabs.getState().setPaletteOpen(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hover = useHoverIntent();

  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo<Item[]>(() => {
    const s = useTabs.getState();
    const cfg = useSettings.getState();
    // One entry per pane, in tab order; panes of a split tab say which
    // pane they are, so identical folders can be told apart.
    const tabItems: Item[] = s.groups.flatMap((group, gi) => {
      const ids = paneIds(group.layout);
      return ids.flatMap((id, pi) => {
        const tab = tabs.find((t) => t.id === id);
        if (!tab) return [];
        const where = [ids.length > 1 ? `pane ${pi + 1}` : null, gi < 9 ? `${mod}${gi + 1}` : null];
        return [
          {
            id: tab.id,
            label: tab.customName ?? (tab.cwd ? tildify(tab.cwd) : tab.title ?? `Terminal ${gi + 1}`),
            hint: where.filter(Boolean).join("  ·  ") || undefined,
            icon: <SquareTerminal size={15} />,
            run: () => s.setActive(tab.id),
          },
        ];
      });
    });
    const actions: Item[] = [
      { id: "new-tab", label: "New tab", hint: `${mod}T`, icon: <Plus size={15} />, run: s.addTab },
      {
        id: "rename-tab",
        label: "Rename tab",
        icon: <PencilLine size={15} />,
        // Shown after the palette closes, so focus lands in the name field.
        run: () => setTimeout(() => s.setRenaming(s.activeId), 60),
      },
      {
        id: "new-group",
        label: "Add tab to new group",
        icon: <FolderPlus size={15} />,
        run: () => s.addSection(s.activeId),
      },
      { id: "split-right", label: "Split pane right", hint: `${mod}D`, icon: <Columns2 size={15} />, run: () => s.splitActive("row") },
      { id: "split-down", label: "Split pane down", hint: appKey("D", true), icon: <Rows2 size={15} />, run: () => s.splitActive("column") },
      { id: "next-pane", label: "Focus next pane", hint: `${mod}]`, icon: <ArrowRightLeft size={15} />, run: () => s.focusPane(1) },
      { id: "close-tab", label: "Close pane", hint: `${mod}W`, icon: <X size={15} />, run: () => s.closeTab(s.activeId) },
      { id: "toggle-sidebar", label: "Toggle tabs panel", hint: `${mod}B`, icon: <PanelLeft size={15} />, run: s.toggleSidebar },
      { id: "clear", label: "Clear terminal", hint: `${mod}K`, icon: <Eraser size={15} />, run: () => terminals.get(s.activeId)?.clear() },
      { id: "zoom-in", label: "Increase font size", hint: `${mod}=`, icon: <ZoomIn size={15} />, run: () => cfg.zoom(1) },
      { id: "zoom-out", label: "Decrease font size", hint: `${mod}-`, icon: <ZoomOut size={15} />, run: () => cfg.zoom(-1) },
      { id: "zoom-reset", label: "Reset font size", hint: `${mod}0`, icon: <Command size={15} />, run: () => cfg.zoom(0) },
      {
        id: "backup",
        label: "Export / import settings & tabs…",
        icon: <ArchiveRestore size={15} />,
        run: () => cfg.setSettingsOpen(true, "backup"),
      },
      { id: "settings", label: "Open settings", hint: `${mod},`, icon: <Settings size={15} />, run: () => cfg.setSettingsOpen(true) },
      ...themes.map((t) => ({
        id: `theme-${t.id}`,
        label: `Theme: ${t.name}`,
        hint: t.id === cfg.themeId ? "current" : undefined,
        icon: <Palette size={15} />,
        run: () => cfg.update({ themeId: t.id }),
      })),
    ];
    const q = query.trim().toLowerCase();
    const all = [...tabItems, ...actions];
    if (!q) return all;
    // Simple fuzzy match: every typed character appears in order.
    return all.filter((item) => {
      const text = `${item.label} ${item.hint ?? ""}`.toLowerCase();
      let pos = 0;
      for (const ch of q) {
        pos = text.indexOf(ch, pos);
        if (pos === -1) return false;
        pos++;
      }
      return true;
    });
  }, [tabs, query]);

  useEffect(() => setSelected(0), [query]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  return (
    <motion.div
      {...fade}
      className="fixed inset-0 z-50 flex justify-center bg-black/40 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <motion.div
        {...pop}
        className="flex h-fit max-h-[60vh] w-[min(620px,90vw)] flex-col overflow-hidden rounded-xl border border-[var(--nova-border-strong)] bg-[var(--nova-panel)] shadow-2xl shadow-black/60 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 border-b border-[var(--nova-border)] px-4">
          <Search size={16} className="shrink-0 text-[var(--nova-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tabs and commands…"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(items[selected]);
              }
            }}
            className="h-12 flex-1 bg-transparent text-[15px] text-[var(--nova-text)] outline-none placeholder:text-[var(--nova-faint)]"
          />
        </div>
        <ul className="overflow-y-auto p-1.5">
          {items.map((item, i) => (
            <li
              key={item.id}
              onMouseMove={(e) => hover(e, () => i !== selected && setSelected(i))}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
              className={[
                "relative flex h-9 cursor-default items-center gap-3 rounded-md px-3 text-[13px] [&>*:not(:first-child)]:relative",
                i === selected ? "text-[var(--nova-text)]" : "text-[var(--nova-muted)]",
              ].join(" ")}
            >
              {i === selected && <span className="absolute inset-0 rounded-md bg-[var(--nova-accent)]/20" />}
              <span className="shrink-0 opacity-80">{item.icon}</span>
              <span className="truncate">{item.label}</span>
              {item.hint && <span className="ml-auto shrink-0 text-[11px] text-[var(--nova-faint)]">{item.hint}</span>}
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-[12.5px] text-[var(--nova-faint)]">Nothing matches.</li>
          )}
        </ul>
      </motion.div>
    </motion.div>
  );
}
