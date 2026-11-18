import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent, type RefObject } from "react";
import { AnimatePresence, Reorder, motion } from "framer-motion";
import {
  ChevronRight,
  Columns2,
  Ellipsis,
  FolderPlus,
  GitBranch,
  Plus,
  Search,
  SquareTerminal,
  TriangleAlert,
  X,
} from "lucide-react";

import { useRowDrag } from "../lib/dragBounds";
import { hoverScrollbar } from "../lib/hoverIntent";
import { glide } from "../lib/motion";
import { isMac } from "../lib/shortcuts";
import { tabLabel } from "../lib/tabLabel";
import { paneIds, type Group } from "../stores/layout";
import { sectionColor, useTabs, type Section, type Tab } from "../stores/tabs";
import { RenameInput } from "./RenameInput";
import { TERMINAL_FONT } from "./TerminalView";

/**
 * Vertical tabs: folder, git branch and status for every session.
 * A split tab shows as a group with its panes listed underneath. Slides in
 * and out, rows can be dragged to reorder, and the right edge resizes it.
 */
export function TabsPanel() {
  const tabs = useTabs((s) => s.tabs);
  const groups = useTabs((s) => s.groups);
  const sections = useTabs((s) => s.sections);
  const activeId = useTabs((s) => s.activeId);
  const addTab = useTabs((s) => s.addTab);
  const width = useTabs((s) => s.sidebarWidth);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const byId = new Map(tabs.map((t) => [t.id, t]));
  const q = query.trim().toLowerCase();
  const matches = (t: Tab | undefined) =>
    !!t && [t.cwd, t.branch, t.title, t.customName].some((v) => v?.toLowerCase().includes(q));
  const visible = q ? groups.filter((g) => paneIds(g.layout).some((id) => matches(byId.get(id)))) : groups;

  // The list, as keys: "s:<group header>", "g:<tab>", and "loose" (the
  // divider before ungrouped tabs). While dragging, `live` holds the order
  // the rows are being shuffled into; it's applied when the drag ends.
  const [live, setLive] = useState<string[] | null>(null);
  const liveRef = useRef<string[] | null>(null);
  const [movingSection, setMovingSection] = useState<string | null>(null);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const sectionById = new Map(sections.map((x) => [x.id, x]));

  const modelKeys: string[] = [];
  if (q) {
    for (const g of visible) modelKeys.push(`g:${g.id}`);
  } else {
    for (const section of sections) {
      modelKeys.push(`s:${section.id}`);
      // A group being dragged travels folded (just its header).
      if (section.collapsed || movingSection === section.id) continue;
      for (const g of groups) if (g.sectionId === section.id) modelKeys.push(`g:${g.id}`);
    }
    if (sections.length > 0) modelKeys.push("loose");
    for (const g of groups) if (!g.sectionId) modelKeys.push(`g:${g.id}`);
  }
  const keys = (live ?? modelKeys).filter((k) =>
    k === "loose" ? sections.length > 0 : k.startsWith("s:") ? sectionById.has(k.slice(2)) : groupById.has(k.slice(2)),
  );

  const setOrder = (next: string[] | null) => {
    liveRef.current = next;
    setLive(next);
  };
  const finishDrag = () => {
    if (liveRef.current) useTabs.getState().applyPanelOrder(liveRef.current);
    setOrder(null);
    setMovingSection(null);
  };
  const startSectionDrag = (id: string) => {
    setMovingSection(id);
    setOrder(keys.filter((k) => !(k.startsWith("g:") && groupById.get(k.slice(2))?.sectionId === id)));
  };

  // Which group each row sits under right now (follows a drag live, so a
  // tab shows as part of a group the moment it's dragged into it).
  const sectionOfRow = new Map<string, Section | null>();
  {
    // undefined = above every header (such rows join the first group).
    let current: Section | null | undefined = undefined;
    for (const key of keys) {
      if (key.startsWith("s:")) current = sectionById.get(key.slice(2)) ?? null;
      else if (key === "loose") current = null;
      else sectionOfRow.set(key, current === undefined ? (q ? null : sections[0] ?? null) : current);
    }
  }

  const onResizeStart = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, width };
    setDragging(true);
  };
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    useTabs.getState().setSidebarWidth(dragStart.current.width + e.clientX - dragStart.current.x);
  };
  const onResizeEnd = () => {
    dragStart.current = null;
    setDragging(false);
  };

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={dragging ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="nova-surface relative shrink-0 overflow-hidden border-r border-[var(--nova-border)] bg-[var(--nova-chrome)]"
    >
      {/* Fixed-width inner box, so content doesn't squash while sliding. */}
      <div className="flex h-full flex-col" style={{ width }}>
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <Search size={14} className="shrink-0 text-[var(--nova-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tabs..."
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--nova-text)] outline-none placeholder:text-[var(--nova-faint)]"
          />
          <button
            type="button"
            onClick={() => useTabs.getState().addSection()}
            title="New tab group"
            className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--nova-muted)] hover:bg-[var(--nova-hover)] hover:text-[var(--nova-text)]"
          >
            <FolderPlus size={15} />
          </button>
          <button
            type="button"
            onClick={addTab}
            title={`New tab (${isMac ? "⌘" : "Ctrl+Shift+"}T)`}
            className="-ml-1 grid size-7 shrink-0 place-items-center rounded-md text-[var(--nova-muted)] hover:bg-[var(--nova-hover)] hover:text-[var(--nova-text)]"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Drag a tab to reorder (turned off while searching). */}
        <Reorder.Group
          ref={listRef}
          // The list scrolls: lets drag-to-reorder measure positions correctly.
          layoutScroll
          as="div"
          axis="y"
          values={keys}
          onReorder={(next) => {
            if (!q) setOrder(next);
          }}
          // The scrollbar shows only while the pointer is over the list.
          onMouseEnter={(e: ReactMouseEvent<HTMLDivElement>) => hoverScrollbar(e.currentTarget, true)}
          onMouseLeave={(e: ReactMouseEvent<HTMLDivElement>) => hoverScrollbar(e.currentTarget, false)}
          className="nova-hover-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden px-2 pb-2"
        >
          <AnimatePresence initial={false}>
            {keys.map((key) => {
              if (key === "loose") return <LooseDivider key={key} empty={!groups.some((g) => !g.sectionId)} />;
              if (key.startsWith("s:")) {
                const section = sectionById.get(key.slice(2))!;
                const members = groups.filter((g) => g.sectionId === section.id);
                return (
                  <SectionHeader
                    key={key}
                    section={section}
                    count={members.length}
                    holdsActive={members.some((g) => paneIds(g.layout).includes(activeId))}
                    bounds={listRef}
                    onDragStart={() => startSectionDrag(section.id)}
                    onDragEnd={finishDrag}
                  />
                );
              }
              const group = groupById.get(key.slice(2))!;
              return (
                <GroupItem
                  key={key}
                  itemKey={key}
                  group={group}
                  index={groups.indexOf(group)}
                  tabs={byId}
                  activeId={activeId}
                  draggable={!q}
                  bounds={listRef}
                  section={sectionOfRow.get(key) ?? null}
                  onDragEnd={finishDrag}
                />
              );
            })}
          </AnimatePresence>
          {visible.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px] text-[var(--nova-faint)]">No tabs match.</p>
          )}
        </Reorder.Group>
      </div>

      {/* Drag to resize. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize tabs panel"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={() => useTabs.getState().setSidebarWidth(280)}
        className={[
          "absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize transition-colors",
          dragging ? "bg-[var(--nova-accent)]/60" : "hover:bg-[var(--nova-accent)]/30",
        ].join(" ")}
      />
    </motion.aside>
  );
}

/** One tab in the list: a single session row, or a split group with its panes. */
function GroupItem({
  itemKey,
  group,
  index,
  tabs,
  activeId,
  draggable,
  bounds,
  section,
  onDragEnd,
}: {
  itemKey: string;
  group: Group;
  index: number;
  tabs: Map<string, Tab>;
  activeId: string;
  draggable: boolean;
  /** A dragged tab stays inside the list (never over the search box). */
  bounds: RefObject<HTMLDivElement | null>;
  /** The tab group it's shown under (indented, with the group's colour). */
  section: Section | null;
  onDragEnd: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const ids = paneIds(group.layout);
  const sessions = ids.map((id) => tabs.get(id)).filter((t): t is Tab => !!t);
  const split = sessions.length > 1;
  const renaming = useTabs((s) => s.renamingId !== null && ids.includes(s.renamingId));
  const limits = useRowDrag(bounds, draggable && !renaming);
  const groupActive = ids.includes(activeId);
  const shortcut = index < 9 && isMac ? `⌘${index + 1}` : "";

  return (
    <Reorder.Item
      as="div"
      value={itemKey}
      {...limits.props}
      dragElastic={0.04}
      // (Drags only start once the pointer really moves; see useRowDrag.)
      onDragStart={() => {
        limits.onDragStart();
        setDragging(true);
      }}
      onDragEnd={() => {
        limits.onDragEnd();
        setDragging(false);
        onDragEnd();
      }}
      // Calm motion only: rows fade in and out, and glide (no bounce, no
      // stretching) when others are added, removed, folded or reordered.
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0 } }}
      transition={glide}
      className={[
        "group/item relative shrink-0 rounded-lg transition-[margin] duration-150",
        section ? "ml-4" : "",
        dragging ? "bg-[var(--nova-tab-active)] shadow-xl shadow-black/40" : "",
        split ? "border border-[var(--nova-border)] p-1.5" : "",
      ].join(" ")}
    >
      {/* Guide line in the group's colour, linking the tab to its header. */}
      {section && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-2.5 bottom-0.5 top-0.5 w-0.5 rounded-full opacity-50"
          style={{ background: sectionColor(section.color) }}
        />
      )}
      {split ? (
        <>
          {/* Header for a split tab: what it is, its shortcut, close all. */}
          <div className="flex h-6 items-center gap-1.5 px-1.5 text-[11px] text-[var(--nova-faint)]">
            <Columns2 size={12} className={groupActive ? "text-[var(--nova-accent)]" : ""} />
            <span className="min-w-0 flex-1 truncate">
              {sessions[0].cwd ? `${tabLabel(sessions[0]).label} · ${sessions.length} panes` : `${sessions.length} panes`}
            </span>
            <span className="group-hover/item:hidden">{shortcut}</span>
            <button
              type="button"
              aria-label="Close tab and all its panes"
              title="Close tab and all its panes"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => useTabs.getState().closeGroup(group.id)}
              className="hidden size-5 place-items-center rounded hover:bg-[var(--nova-hover-strong)] hover:text-[var(--nova-text)] group-hover/item:grid"
            >
              <X size={11} strokeWidth={2.25} />
            </button>
          </div>
          {/* A little air between the panes of a split tab. */}
          <div className="flex flex-col gap-1.5">
            {sessions.map((tab) => (
              <SessionRow key={tab.id} tab={tab} shortcut="" active={tab.id === activeId} nested />
            ))}
          </div>
        </>
      ) : (
        sessions[0] && <SessionRow tab={sessions[0]} shortcut={shortcut} active={groupActive} nested={false} />
      )}

    </Reorder.Item>
  );
}

/** Opens Nova's right-click menu for an element (for "…" buttons). */
function openMenu(e: ReactMouseEvent<HTMLElement>) {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left, clientY: r.bottom + 4 }),
  );
}

/** Header of a tab group: fold/unfold, name, colour, count, quick actions. */
function SectionHeader({
  section,
  count,
  holdsActive,
  bounds,
  onDragStart,
  onDragEnd,
}: {
  section: Section;
  count: number;
  /** The active tab is in this group (shown when it's folded). */
  holdsActive: boolean;
  bounds: RefObject<HTMLDivElement | null>;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const editing = useTabs((s) => s.editingSectionId === section.id);
  const [dragging, setDragging] = useState(false);
  const limits = useRowDrag(bounds, !editing);
  // A drag ends with a click on the header; that one shouldn't fold it.
  const dragged = useRef(false);
  const color = sectionColor(section.color);
  const toggle = () => useTabs.getState().toggleSection(section.id);

  return (
    <Reorder.Item
      as="div"
      value={`s:${section.id}`}
      data-section-id={section.id}
      {...limits.props}
      dragElastic={0.04}
      // A drag folds the group so it travels as one row.
      onDragStart={() => {
        limits.onDragStart();
        dragged.current = true;
        setDragging(true);
        onDragStart();
      }}
      onDragEnd={() => {
        limits.onDragEnd();
        setDragging(false);
        onDragEnd();
        // Let the click that ends a drag through the check below, then reset.
        setTimeout(() => (dragged.current = false), 0);
      }}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0 } }}
      transition={glide}
      className={[
        "group/section relative mt-1 shrink-0 rounded-md first:mt-0",
        dragging ? "bg-[var(--nova-tab-active)] shadow-xl shadow-black/40" : "",
      ].join(" ")}
    >
      <div
        role="button"
        aria-expanded={!section.collapsed}
        title={section.collapsed ? "Show tabs" : "Hide tabs"}
        onClick={() => {
          if (dragged.current) return; // the end of a drag, not a click
          if (!editing) toggle();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          useTabs.getState().setEditingSection(section.id);
        }}
        className="flex h-8 cursor-default items-center gap-2 rounded-md px-2 hover:bg-[var(--nova-fill)]"
      >
        <ChevronRight
          size={13}
          strokeWidth={2}
          className="shrink-0 text-[var(--nova-faint)] transition-transform duration-150"
          style={{ transform: section.collapsed ? "none" : "rotate(90deg)" }}
        />
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        {editing ? (
          <SectionNameInput section={section} />
        ) : (
          <span
            className={[
              "min-w-0 flex-1 truncate text-[12.5px] font-medium",
              section.collapsed && holdsActive ? "text-[var(--nova-accent)]" : "text-[var(--nova-text)]",
            ].join(" ")}
          >
            {section.name}
          </span>
        )}
        {!editing && (
          <>
            <span className="shrink-0 text-[11px] tabular-nums text-[var(--nova-faint)] group-hover/section:hidden">
              {count}
            </span>
            <button
              type="button"
              title="New tab in this group"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                useTabs.getState().addTabToSection(section.id);
              }}
              className="hidden size-5 shrink-0 place-items-center rounded text-[var(--nova-muted)] hover:bg-[var(--nova-hover-strong)] hover:text-[var(--nova-text)] group-hover/section:grid"
            >
              <Plus size={13} />
            </button>
            <button
              type="button"
              title="Group options"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={openMenu}
              className="hidden size-5 shrink-0 place-items-center rounded text-[var(--nova-muted)] hover:bg-[var(--nova-hover-strong)] hover:text-[var(--nova-text)] group-hover/section:grid"
            >
              <Ellipsis size={13} />
            </button>
          </>
        )}
      </div>
      {!section.collapsed && count === 0 && (
        <div className="ml-4 px-2 pb-1 text-[11.5px] text-[var(--nova-faint)]">Empty · drag tabs here</div>
      )}
    </Reorder.Item>
  );
}

/** Inline editor for a group's name: ⏎ saves, Esc cancels. */
function SectionNameInput({ section }: { section: Section }) {
  const [value, setValue] = useState(section.name);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    useTabs.getState().renameSection(section.id, value);
  };
  return (
    <input
      ref={ref}
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          useTabs.getState().setEditingSection(null);
        }
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="h-6 min-w-0 flex-1 rounded border border-[var(--nova-accent)] bg-[var(--nova-bg)] px-1 text-[12.5px] font-medium text-[var(--nova-text)] outline-none"
    />
  );
}

/** Where the ungrouped tabs start (drag a tab below it to take it out of a group). */
function LooseDivider({ empty }: { empty: boolean }) {
  return (
    <Reorder.Item
      as="div"
      value="loose"
      dragListener={false}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={glide}
      className="flex shrink-0 items-center gap-2 px-2 pb-0.5 pt-2 text-[10.5px] font-medium uppercase tracking-wide text-[var(--nova-faint)]"
    >
      <span>{empty ? "Drop here to ungroup" : "Other tabs"}</span>
      <span className="h-px flex-1 bg-[var(--nova-border)]" />
    </Reorder.Item>
  );
}

/** A shell session: icon, name (double-click to rename), branch or folder. */
function SessionRow({ tab, shortcut, active, nested }: { tab: Tab; shortcut: string; active: boolean; nested: boolean }) {
  const setActive = useTabs((s) => s.setActive);
  const closeTab = useTabs((s) => s.closeTab);
  const renaming = useTabs((s) => s.renamingId === tab.id);
  const { label, auto, folder, location, failed } = tabLabel(tab);

  return (
    <div
      role="tab"
      data-tab-id={tab.id}
      aria-selected={active}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeTab(tab.id);
        } else if (e.button === 0) {
          setActive(tab.id);
        }
      }}
      className={[
        "group relative flex cursor-default items-center rounded-lg",
        // Same height for every row, nested or not, so spacing looks even.
        nested ? "gap-2.5 px-2 py-2" : "gap-3 px-2.5 py-2",
        active ? "" : "hover:bg-[var(--nova-fill)]",
      ].join(" ")}
    >
      {active && (
        <div className="nova-highlight-in absolute inset-0 rounded-lg border border-[var(--nova-border-strong)] bg-[var(--nova-tab-active)]" />
      )}

      <div
        className={[
          "relative grid shrink-0 place-items-center rounded-full transition-colors",
          nested ? "size-6" : "size-8",
          active ? "bg-[var(--nova-hover-strong)] text-[var(--nova-text)]" : "bg-[var(--nova-hover)] text-[var(--nova-muted)]",
        ].join(" ")}
      >
        <SquareTerminal size={nested ? 12 : 15} strokeWidth={1.75} />
        <AnimatePresence>
          {tab.running && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={glide}
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[var(--nova-chrome)] bg-[var(--nova-accent)]"
            />
          )}
        </AnimatePresence>
      </div>

      <div className="relative min-w-0 flex-1">
        {/* Fixed line height: the close button that replaces the shortcut on
            hover mustn't make the row grow. */}
        <div className="flex min-h-5 items-center gap-1.5">
          <AnimatePresence>
            {failed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={glide}
                className="shrink-0"
              >
                <TriangleAlert size={13} className="text-[var(--nova-red)]" />
              </motion.span>
            )}
          </AnimatePresence>
          {renaming ? (
            <RenameInput tab={tab} autoLabel={auto} className="h-6 flex-1 text-[13px]" style={{ fontFamily: TERMINAL_FONT }} />
          ) : (
            // The folder's own name (or your name for the tab). Double-click
            // to rename.
            <span
              key={label}
              onDoubleClick={() => useTabs.getState().setRenaming(tab.id)}
              className={[
                "nova-fade-in min-w-0 flex-1 truncate text-[var(--nova-text)]",
                nested ? "text-[12.5px]" : "text-[13px]",
              ].join(" ")}
              style={{ fontFamily: TERMINAL_FONT }}
              title={`${folder && folder !== label ? `${label}  ·  ${folder}` : label} — double-click to rename`}
            >
              {label}
            </span>
          )}
          {shortcut && <span className="shrink-0 text-[11px] text-[var(--nova-faint)] group-hover:hidden">{shortcut}</span>}
          <button
            type="button"
            aria-label={nested ? "Close pane" : "Close tab"}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => closeTab(tab.id)}
            className="hidden size-5 shrink-0 place-items-center rounded text-[var(--nova-muted)] hover:bg-[var(--nova-hover-strong)] hover:text-[var(--nova-text)] group-hover:grid"
          >
            <X size={12} strokeWidth={2.25} />
          </button>
        </div>
        {/* Branch, then where the folder is (small, cut at the start so the
            nearest folders stay visible when the panel is narrow). */}
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--nova-muted)]">
          {tab.branch && (
            <span key={tab.branch} className="nova-fade-in flex min-w-0 max-w-[60%] shrink-0 items-center gap-1">
              <GitBranch size={11} className="shrink-0" />
              <span className="truncate">{tab.branch}</span>
            </span>
          )}
          {tab.branch && location && <span className="shrink-0 text-[var(--nova-faint)]">·</span>}
          {location && (
            <span
              className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--nova-faint)]"
              style={{ direction: "rtl", textAlign: "left", fontFamily: TERMINAL_FONT }}
              title={folder ?? undefined}
            >
              <bdi>{location}</bdi>
            </span>
          )}
          {!tab.cwd && <span className="truncate">Starting…</span>}
        </div>
      </div>
    </div>
  );
}
