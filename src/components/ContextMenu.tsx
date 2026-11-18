import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { readClipboard, writeClipboard } from "../lib/clipboard";
import { inputId, terminals } from "../lib/registry";
import { appKey, isMac } from "../lib/platform";
import { paneIds } from "../stores/layout";
import {
  SECTION_COLORS,
  groupOf,
  sectionColor,
  showsInput,
  useTabs,
  type SectionColor,
} from "../stores/tabs";

type Item =
  | {
      label: string;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      run: () => void;
    }
  /** A row of colour swatches (tab group colour). */
  | { colors: readonly SectionColor[]; current: SectionColor; pick: (color: SectionColor) => void }
  | "-";

/** "⌘K" on macOS, "Ctrl+Shift+K" elsewhere (Nova's app shortcuts). */
const key = (letter: string, variant = false) => (isMac ? `${variant ? "⇧" : ""}⌘${letter}` : appKey(letter, variant));

type Field = HTMLInputElement | HTMLTextAreaElement;

/** Cut / Copy / Paste / Select all for any text box. */
function fieldItems(field: Field): Item[] {
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? 0;
  const selected = field.value.slice(start, end);
  const editable = !field.readOnly && !field.disabled;
  const restore = () => {
    field.focus();
    field.setSelectionRange(start, end);
  };
  return [
    {
      label: "Cut",
      shortcut: isMac ? "⌘X" : "Ctrl+X",
      disabled: !selected || !editable,
      run: () => {
        void writeClipboard(selected);
        restore();
        document.execCommand("delete");
      },
    },
    { label: "Copy", shortcut: isMac ? "⌘C" : "Ctrl+C", disabled: !selected, run: () => void writeClipboard(selected) },
    {
      label: "Paste",
      shortcut: isMac ? "⌘V" : "Ctrl+V",
      disabled: !editable,
      run: () =>
        void readClipboard().then((text) => {
          if (!text) return;
          restore();
          // Like typing it: keeps undo and updates the box as usual.
          document.execCommand("insertText", false, text);
        }),
    },
    "-",
    {
      label: "Select all",
      run: () => {
        field.focus();
        field.select();
      },
    },
  ];
}

/** Pastes into a session: its input box at the prompt, else the program. */
async function pasteInto(tabId: string) {
  const text = await readClipboard();
  if (!text) return;
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
  const box = document.getElementById(inputId(tabId)) as HTMLTextAreaElement | null;
  if (showsInput(tab) && box) {
    box.focus();
    document.execCommand("insertText", false, text);
  } else {
    terminals.get(tabId)?.term.paste(text);
  }
}

function panesWith(tabId: string) {
  const group = groupOf(useTabs.getState().groups, tabId);
  return { group, count: group ? paneIds(group.layout).length : 1 };
}

const split = (tabId: string, dir: "row" | "column") => {
  useTabs.getState().setActive(tabId);
  useTabs.getState().splitActive(dir);
};

/** Right-click on a terminal's output. */
function terminalItems(tabId: string): Item[] {
  const live = terminals.get(tabId);
  if (!live) return [];
  const selection = live.term.hasSelection() ? live.term.getSelection() : "";
  const { count } = panesWith(tabId);
  return [
    { label: "Copy", shortcut: key("C"), disabled: !selection, run: () => void writeClipboard(selection) },
    { label: "Paste", shortcut: key("V"), run: () => void pasteInto(tabId) },
    { label: "Select all", run: () => live.term.selectAll() },
    "-",
    { label: "Clear", shortcut: key("K"), run: () => live.clear() },
    "-",
    { label: "Split right", shortcut: key("D"), run: () => split(tabId, "row") },
    { label: "Split down", shortcut: key("D", true), run: () => split(tabId, "column") },
    "-",
    {
      label: count > 1 ? "Close pane" : "Close tab",
      shortcut: key("W"),
      danger: true,
      run: () => useTabs.getState().closeTab(tabId),
    },
  ];
}

/** Right-click on a tab (tabs panel or top bar). */
function tabItems(tabId: string): Item[] {
  const { group, count } = panesWith(tabId);
  const { sections, moveToSection, addSection } = useTabs.getState();
  const items: Item[] = [
    { label: "Rename…", run: () => useTabs.getState().setRenaming(tabId) },
    { label: "Split right", run: () => split(tabId, "row") },
    "-",
    { label: "Add to new group", run: () => addSection(tabId) },
  ];
  // "Move to <group>" for the other groups (the first few).
  for (const section of sections.filter((x) => x.id !== group?.sectionId).slice(0, 6)) {
    items.push({ label: `Move to “${section.name}”`, run: () => moveToSection(tabId, section.id) });
  }
  if (group?.sectionId) items.push({ label: "Remove from group", run: () => moveToSection(tabId, null) });
  items.push("-", {
    label: count > 1 ? "Close pane" : "Close tab",
    danger: true,
    run: () => useTabs.getState().closeTab(tabId),
  });
  if (group && count > 1) {
    items.push({ label: "Close all panes", danger: true, run: () => useTabs.getState().closeGroup(group.id) });
  }
  return items;
}

/** Right-click on a tab group's header. */
function sectionItems(sectionId: string): Item[] {
  const state = useTabs.getState();
  const section = state.sections.find((x) => x.id === sectionId);
  if (!section) return [];
  const count = state.groups.filter((g) => g.sectionId === sectionId).length;
  return [
    { label: "New tab in group", run: () => useTabs.getState().addTabToSection(sectionId) },
    { label: "Rename…", run: () => useTabs.getState().setEditingSection(sectionId) },
    {
      label: section.collapsed ? "Expand" : "Collapse",
      run: () => useTabs.getState().toggleSection(sectionId),
    },
    "-",
    { colors: SECTION_COLORS, current: section.color, pick: (c) => useTabs.getState().setSectionColor(sectionId, c) },
    "-",
    { label: "Ungroup (keep tabs)", run: () => useTabs.getState().ungroupSection(sectionId) },
    {
      label: count > 0 ? `Close ${count} tab${count === 1 ? "" : "s"} and group` : "Delete group",
      danger: true,
      run: () => useTabs.getState().closeSection(sectionId),
    },
  ];
}

/** What to offer for whatever was right-clicked (nothing = no menu). */
function itemsFor(target: Element): Item[] {
  const field = target.closest<Field>("input, textarea");
  if (field && !field.classList.contains("xterm-helper-textarea")) return fieldItems(field);
  const section = target.closest<HTMLElement>("[data-section-id]");
  if (section?.dataset.sectionId) return sectionItems(section.dataset.sectionId);
  const tab = target.closest<HTMLElement>("[data-tab-id]");
  if (tab?.dataset.tabId) return tabItems(tab.dataset.tabId);
  if (target.closest("[data-input-bar]")) return [];
  const pane = target.closest<HTMLElement>("[data-pane]");
  if (pane?.dataset.pane) return terminalItems(pane.dataset.pane);
  return [];
}

/**
 * Nova's own right-click menu, in place of the web view's (Reload, Inspect
 * Element, Back…), with only what makes sense where you clicked.
 * While developing, ⌥-right-click still opens the built-in one.
 */
export function ContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: Item[] } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (import.meta.env.DEV && e.altKey) return;
      e.preventDefault();
      const items = e.target instanceof Element ? itemsFor(e.target) : [];
      setPos(null);
      setMenu(items.length ? { x: e.clientX, y: e.clientY, items } : null);
    };
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => window.removeEventListener("contextmenu", onContextMenu, true);
  }, []);

  // Keep the whole menu on screen (open upward / leftward near the edges).
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    // Layout size (offset*), not the pop-in animation's scaled size.
    const width = ref.current.offsetWidth;
    const height = ref.current.offsetHeight;
    const margin = 6;
    const left = Math.max(margin, Math.min(menu.x, window.innerWidth - width - margin));
    const top = menu.y + height > window.innerHeight - margin ? Math.max(margin, menu.y - height) : menu.y;
    setPos({ left, top });
  }, [menu]);

  // Click elsewhere, Escape, scrolling or leaving the window closes it.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  if (!menu) return null;

  return (
    <div
      ref={ref}
      role="menu"
      // Keeps focus (and a text selection) where it was.
      onMouseDown={(e) => e.preventDefault()}
      className="nova-menu nova-menu-in fixed z-[100] min-w-[210px] rounded-lg border border-[var(--nova-border-strong)] bg-[var(--nova-panel)] p-1 text-[13px] shadow-xl shadow-black/40 backdrop-blur-xl"
      style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}
    >
      {menu.items.map((item, i) =>
        item === "-" ? (
          <div key={`sep-${i}`} className="mx-1 my-1 h-px bg-[var(--nova-border)]" />
        ) : "colors" in item ? (
          <div key={`colors-${i}`} className="flex items-center gap-1.5 px-2.5 py-1.5">
            {item.colors.map((color) => (
              <button
                key={color}
                type="button"
                title={color[0].toUpperCase() + color.slice(1)}
                aria-label={`Colour: ${color}`}
                onClick={() => {
                  setMenu(null);
                  item.pick(color);
                }}
                className={[
                  "grid size-5 place-items-center rounded-full transition-transform hover:scale-110",
                  color === item.current ? "ring-2 ring-[var(--nova-text)]/70 ring-offset-2 ring-offset-[var(--nova-panel)]" : "",
                ].join(" ")}
              >
                <span className="size-3.5 rounded-full" style={{ background: sectionColor(color) }} />
              </button>
            ))}
          </div>
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              setMenu(null);
              item.run();
            }}
            className={[
              "flex h-7 w-full cursor-default items-center justify-between gap-8 rounded-md px-2.5 text-left text-[var(--nova-text)] disabled:text-[var(--nova-faint)]",
              item.danger
                ? "enabled:hover:bg-[var(--nova-red)]/15 enabled:hover:text-[var(--nova-red)]"
                : "enabled:hover:bg-[var(--nova-accent)]/20",
            ].join(" ")}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="text-[11.5px] text-[var(--nova-faint)]">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
