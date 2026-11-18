import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { AnimatePresence, Reorder } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { glide } from "../lib/motion";
import { Columns2, Copy, Minus, PanelLeft, Plus, Search, Settings, Square, SquareTerminal, X } from "lucide-react";
import { insideNovaApp } from "../lib/pty";
import { useSettings } from "../stores/settings";
import { sectionColor, useTabs, type Tab } from "../stores/tabs";
import { useRowDrag } from "../lib/dragBounds";
import { isMac } from "../lib/shortcuts";
import { tabLabel } from "../lib/tabLabel";
import { RenameInput } from "./RenameInput";
import { paneIds } from "../stores/layout";
import { useFullscreen } from "../lib/windowState";

const mod = isMac ? "⌘" : "Ctrl+Shift+";

/**
 * The top bar: traffic lights (or window buttons on Windows), sidebar toggle, and a search bar in the
 * middle. When the tabs panel is hidden, the tabs move up here.
 */
export function TitleBar() {
  const sidebarOpen = useTabs((s) => s.sidebarOpen);
  const toggleSidebar = useTabs((s) => s.toggleSidebar);
  const setPaletteOpen = useTabs((s) => s.setPaletteOpen);
  const fullscreen = useFullscreen();

  return (
    <header
      data-tauri-drag-region
      className={[
        "nova-surface relative flex h-11 shrink-0 items-center gap-1 border-b border-[var(--nova-border)] bg-[var(--nova-chrome)]",
        isMac ? "pr-3" : "",
      ].join(" ")}
    >
      {/* Room for the traffic-light buttons on macOS (they sit centred in
          this bar, see trafficLightPosition in tauri.conf.json). In full
          screen they're hidden, so the space goes back to the toolbar. */}
      <div
        data-tauri-drag-region
        className="shrink-0 self-stretch transition-[width] duration-200 ease-out"
        style={{ width: isMac && !fullscreen ? 84 : 8 }}
      />

      <IconButton title={`Toggle tabs panel (${mod}B)`} active={sidebarOpen} onClick={toggleSidebar}>
        <PanelLeft size={16} strokeWidth={1.75} />
      </IconButton>

      {sidebarOpen ? <div data-tauri-drag-region className="h-full flex-1" /> : <HorizontalTabs />}

      {/* Search sits in the middle of the window. */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className={[
          "flex h-[30px] items-center gap-2 rounded-lg border border-[var(--nova-border-strong)] bg-[var(--nova-fill)] px-3 text-[13px] text-[var(--nova-faint)] transition-colors hover:border-[var(--nova-faint)] hover:text-[var(--nova-muted)]",
          sidebarOpen
            ? "absolute left-1/2 w-[min(440px,40%)] -translate-x-1/2"
            : "w-[260px] shrink-0",
        ].join(" ")}
      >
        <Search size={14} className="shrink-0" />
        <span className="truncate">Search tabs and commands…</span>
        <span className="ml-auto shrink-0 text-[11px]">{mod}P</span>
      </button>

      {sidebarOpen && <div data-tauri-drag-region className="h-full flex-1" />}

      <IconButton title={`Settings (${isMac ? "⌘," : "Ctrl+Shift+,"})`} onClick={() => useSettings.getState().setSettingsOpen(true)}>
        <Settings size={16} strokeWidth={1.75} />
      </IconButton>

      {/* Windows and Linux: Nova draws its own minimise / maximise / close. */}
      {!isMac && <WindowControls />}
    </header>
  );
}

/** Minimise, maximise (restore) and close, Windows-style, at the far right. */
function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!insideNovaApp) return;
    const win = getCurrentWindow();
    const check = () => void win.isMaximized().then(setMaximized).catch(() => {});
    check();
    let stop: (() => void) | undefined;
    let cancelled = false;
    void win.onResized(check).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const win = () => getCurrentWindow();
  return (
    <div className="ml-2 flex self-stretch" data-window-controls>
      <ControlButton title="Minimize" onClick={() => void win().minimize()}>
        <Minus size={16} strokeWidth={1.25} />
      </ControlButton>
      <ControlButton title={maximized ? "Restore" : "Maximize"} onClick={() => void win().toggleMaximize()}>
        {maximized ? <Copy size={13} strokeWidth={1.25} className="-scale-x-100" /> : <Square size={13} strokeWidth={1.25} />}
      </ControlButton>
      <ControlButton title="Close" close onClick={() => void win().close()}>
        <X size={17} strokeWidth={1.25} />
      </ControlButton>
    </div>
  );
}

function ControlButton({ title, close, onClick, children }: { title: string; close?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={[
        // No press-in: system window buttons don't move.
        "grid w-[46px] place-items-center text-[var(--nova-muted)] transition-colors duration-100 active:[transform:none]!",
        close ? "hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/85" : "hover:bg-[var(--nova-hover)] hover:text-[var(--nova-text)] active:bg-[var(--nova-hover-strong)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function IconButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        "grid size-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--nova-hover)]",
        active ? "text-[var(--nova-text)]" : "text-[var(--nova-muted)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function HorizontalTabs() {
  const tabs = useTabs((s) => s.tabs);
  const groups = useTabs((s) => s.groups);
  const activeId = useTabs((s) => s.activeId);
  const addTab = useTabs((s) => s.addTab);
  const sections = useTabs((s) => s.sections);
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const colorOf = new Map(sections.map((x) => [x.id, sectionColor(x.color)]));
  const stripRef = useRef<HTMLElement>(null);

  return (
    <>
      {/* Drag tabs left and right to reorder (they stay inside the strip). */}
      <Reorder.Group
        ref={stripRef}
        layoutScroll
        as="nav"
        axis="x"
        values={groups.map((g) => g.id)}
        onReorder={(ids) => useTabs.getState().reorderGroups(ids)}
        className="ml-1 flex min-w-0 items-center gap-1 no-scrollbar overflow-x-auto"
      >
        <AnimatePresence initial={false}>
          {groups.map((group, i) => {
            // A split tab is shown by its focused pane.
            const tab = byId.get(group.focusedId);
            const ids = paneIds(group.layout);
            return tab ? (
              <TabButton
                key={group.id}
                groupId={group.id}
                panes={ids.length}
                tab={tab}
                index={i}
                active={ids.includes(activeId)}
                bounds={stripRef}
                color={group.sectionId ? colorOf.get(group.sectionId) : undefined}
              />
            ) : null;
          })}
        </AnimatePresence>
      </Reorder.Group>
      <IconButton title={`New tab (${mod}T)`} onClick={addTab}>
        <Plus size={15} strokeWidth={2} />
      </IconButton>
      <div data-tauri-drag-region className="h-full flex-1" />
    </>
  );
}

function TabButton({
  groupId,
  panes,
  tab,
  index,
  active,
  bounds,
  color,
}: {
  groupId: string;
  panes: number;
  tab: Tab;
  index: number;
  active: boolean;
  bounds: RefObject<HTMLElement | null>;
  /** Colour of the tab group it belongs to, if any. */
  color?: string;
}) {
  const setActive = useTabs((s) => s.setActive);
  const closeGroup = useTabs((s) => s.closeGroup);
  const renaming = useTabs((s) => s.renamingId === tab.id);
  const { label, auto: autoLabel, folder } = tabLabel(tab);
  const limits = useRowDrag(bounds, !renaming);

  // Keep the active tab in view when the strip scrolls.
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector(`header [data-tab-id="${tab.id}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active, tab.id]);

  return (
    <Reorder.Item
      as="div"
      value={groupId}
      {...limits.props}
      onDragStart={limits.onDragStart}
      onDragEnd={limits.onDragEnd}
      dragElastic={0.04}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
      transition={glide}
      role="tab"
      data-tab-id={tab.id}
      aria-selected={active}
      title={folder ?? label}
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
        if (e.button === 1) {
          e.preventDefault();
          closeGroup(groupId);
        } else if (e.button === 0) {
          setActive(tab.id);
        }
      }}
      className={[
        // 180px wide, shrinking (down to 104px) before the strip scrolls.
        "group relative flex h-[28px] w-[180px] min-w-[104px] shrink cursor-default items-center gap-2 overflow-hidden rounded-md pl-2.5 pr-1 text-[12.5px] transition-colors",
        active ? "text-[var(--nova-text)]" : "text-[var(--nova-muted)] hover:bg-[var(--nova-hover)] hover:text-[var(--nova-text)]",
      ].join(" ")}
    >
      {active && (
        <div className="nova-highlight-in absolute inset-0 rounded-md bg-[var(--nova-tab-active)] shadow-[inset_0_0_0_1px_var(--nova-border-strong)]" />
      )}
      {/* Tabs in a tab group carry its colour. */}
      {color && (
        <span aria-hidden className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full opacity-80" style={{ background: color }} />
      )}
      <SquareTerminal
        size={14}
        strokeWidth={1.75}
        className={active ? "relative shrink-0 text-[var(--nova-accent)]" : "relative shrink-0 opacity-70"}
      />
      {renaming ? (
        <RenameInput tab={tab} autoLabel={autoLabel} className="relative h-5 flex-1 text-[12.5px]" />
      ) : (
        <span
          className="relative min-w-0 flex-1 truncate"
          onDoubleClick={() => useTabs.getState().setRenaming(tab.id)}
        >
          {label}
        </span>
      )}
      {panes > 1 && (
        <span className="relative flex shrink-0 items-center gap-0.5 text-[10.5px] text-[var(--nova-faint)]" title={`${panes} panes`}>
          <Columns2 size={11} />
          {panes}
        </span>
      )}
      {index < 9 && isMac && (
        <span className="relative shrink-0 text-[10.5px] text-[var(--nova-faint)] group-hover:hidden">⌘{index + 1}</span>
      )}
      <button
        type="button"
        aria-label="Close tab"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => closeGroup(groupId)}
        className="relative hidden size-5 shrink-0 place-items-center rounded text-[var(--nova-muted)] hover:bg-[var(--nova-hover-strong)] hover:text-[var(--nova-text)] group-hover:grid"
      >
        <X size={12} strokeWidth={2.25} />
      </button>
    </Reorder.Item>
  );
}
