import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SquareTerminal, TriangleAlert, X } from "lucide-react";

import { easeOut } from "../lib/motion";
import { appKey, isMac } from "../lib/platform";
import { focusActive, terminals } from "../lib/registry";
import { tabLabel } from "../lib/tabLabel";
import { place, type Divider, type Group, type Rect } from "../stores/layout";
import { groupOf, showsInput, useTabs } from "../stores/tabs";
import { InputBar } from "./InputBar";
import { TERMINAL_FONT, TerminalView } from "./TerminalView";

/**
 * The terminal area. Every session stays mounted (its shell keeps running)
 * and is positioned by its tab's split layout, so splitting or closing a
 * pane never restarts the others.
 */
export function Workspace() {
  const groups = useTabs((s) => s.groups);
  const activeId = useTabs((s) => s.activeId);
  const activeGroupId = groupOf(groups, activeId)?.id;

  return (
    <div className="relative min-h-0 flex-1">
      {groups.map((group) => (
        <GroupView key={group.id} group={group} visible={group.id === activeGroupId} activeId={activeId} />
      ))}
    </div>
  );
}

function GroupView({ group, visible, activeId }: { group: Group; visible: boolean; activeId: string }) {
  const placement = useMemo(() => place(group.layout), [group.layout]);
  const ref = useRef<HTMLDivElement>(null);
  const split = placement.panes.size > 1;

  return (
    // Switching tabs cross-fades between them.
    <div
      ref={ref}
      className="absolute inset-0 transition-[opacity,visibility] duration-150"
      style={{ visibility: visible ? "visible" : "hidden", opacity: visible ? 1 : 0 }}
    >
      {[...placement.panes].map(([id, rect]) => (
        <PaneView key={id} tabId={id} rect={rect} visible={visible} focused={id === activeId} split={split} />
      ))}
      {placement.dividers.map((d) => (
        <DividerView key={`${d.splitId}:${d.index}`} divider={d} containerRef={ref} />
      ))}
    </div>
  );
}

const pct = (v: number) => `${v * 100}%`;

function PaneView({
  tabId,
  rect,
  visible,
  focused,
  split,
}: {
  tabId: string;
  rect: Rect;
  visible: boolean;
  focused: boolean;
  split: boolean;
}) {
  const tab = useTabs((s) => s.tabs.find((t) => t.id === tabId));
  const inputShown = showsInput(tab);
  // Quick commands (ls, cd, git status) finish before this, so the input
  // box stays put instead of blinking out and back on every command.
  const inputVisible = useLingering(inputShown, 250);
  if (!tab) return null;
  const { label, location, failed } = tabLabel(tab);

  return (
    <div
      data-pane={tabId}
      className="nova-pane absolute flex flex-col"
      style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
      onMouseDown={() => {
        if (!focused) useTabs.getState().setActive(tabId);
      }}
    >
      {/* Pane header, only when the tab is split. */}
      {split && (
        <div
          className={[
            "nova-surface relative flex h-8 shrink-0 items-center justify-center gap-1.5 border-b px-8 text-[12px]",
            focused
              ? "border-[var(--nova-accent)]/50 text-[var(--nova-text)]"
              : "border-[var(--nova-border)] text-[var(--nova-muted)]",
          ].join(" ")}
        >
          {failed && <TriangleAlert size={12} className="shrink-0 text-[var(--nova-red)]" />}
          <span className="shrink-0 truncate" style={{ maxWidth: "70%" }}>
            {label}
          </span>
          {location && (
            <span
              className="min-w-0 truncate text-[11px] text-[var(--nova-faint)]"
              style={{ direction: "rtl", fontFamily: TERMINAL_FONT }}
              title={location}
            >
              <bdi>{location}</bdi>
            </span>
          )}
          <button
            type="button"
            aria-label="Close pane"
            title={`Close pane (${appKey("W")})`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => useTabs.getState().closeTab(tabId)}
            className="absolute right-2 grid size-5 place-items-center rounded text-[var(--nova-faint)] hover:bg-[var(--nova-hover-strong)] hover:text-[var(--nova-text)]"
          >
            <X size={12} strokeWidth={2.25} />
          </button>
        </div>
      )}

      <div
        className="relative min-h-0 flex-1 overflow-hidden pb-2 pl-4 pr-1 pt-3"
        onMouseUp={() => {
          // Clicking the output keeps typing in the input box, unless you
          // selected text to copy.
          if (inputShown && !terminals.get(tabId)?.term.hasSelection()) focusActive(tabId, true);
        }}
      >
        <TerminalView tabId={tabId} initialCwd={tab.initialCwd} active={visible} />
        <AnimatePresence>{inputShown && !tab.hasOutput && <EmptyHint key="hint" compact={split} />}</AnimatePresence>
      </div>

      {/* The input box only shows at the prompt. While a command
          runs, the program gets the whole pane. */}
      <AnimatePresence initial={false}>
        {inputVisible && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }}
            transition={easeOut}
          >
            <InputBar tab={tab} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unfocused panes are dimmed slightly. */}
      {split && (
        <div
          className="pointer-events-none absolute inset-0 bg-[var(--nova-dim)] transition-opacity duration-200"
          style={{ opacity: focused ? 0 : 1 }}
        />
      )}
    </div>
  );
}

/** `on`, but stays true for `ms` after it turns off (unless it turns back on). */
function useLingering(on: boolean, ms: number) {
  const [lingering, setLingering] = useState(on);
  useEffect(() => {
    if (on) {
      setLingering(true);
      return;
    }
    const timer = setTimeout(() => setLingering(false), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return on || lingering;
}

const HINTS: [string, string][] = [
  [isMac ? "⇥" : "Tab", "Suggestions"],
  [appKey("P"), "Command palette"],
  [appKey("D"), "Split pane"],
  [appKey("T"), "New tab"],
];

/** Quiet welcome in a fresh pane; disappears with the first output. */
function EmptyHint({ compact }: { compact: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      className="pointer-events-none absolute inset-0 grid select-none place-items-center"
    >
      <div className="flex flex-col items-center gap-4 text-[var(--nova-faint)]">
        <SquareTerminal size={compact ? 26 : 30} strokeWidth={1.25} className="opacity-70" />
        {!compact && (
          <div className="grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-2 text-[12px]">
            {HINTS.map(([keys, label]) => (
              <div key={label} className="contents">
                <kbd className="justify-self-end rounded border border-[var(--nova-border-strong)] px-1.5 py-px font-sans text-[11px] text-[var(--nova-muted)]">
                  {keys}
                </kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const MIN_SIZE = 0.1;

/** The line between two panes; drag to resize, double-click to even out. */
function DividerView({ divider, containerRef }: { divider: Divider; containerRef: RefObject<HTMLDivElement> }) {
  const start = useRef<{ pos: number; sizes: number[] } | null>(null);
  const row = divider.dir === "row";
  const { area, index, splitId } = divider;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { pos: row ? e.clientX : e.clientY, sizes: [...divider.sizes] };
    document.body.classList.add("nova-resizing");
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!start.current || !box) return;
    const total = row ? box.width * area.w : box.height * area.h;
    if (total <= 0) return;
    const delta = ((row ? e.clientX : e.clientY) - start.current.pos) / total;
    const sizes = [...start.current.sizes];
    const a = sizes[index] + delta;
    const b = sizes[index + 1] - delta;
    if (a < MIN_SIZE || b < MIN_SIZE) return;
    sizes[index] = a;
    sizes[index + 1] = b;
    useTabs.getState().setSplitSizes(splitId, sizes);
  };

  const onPointerUp = () => {
    start.current = null;
    document.body.classList.remove("nova-resizing");
  };

  const style = row
    ? { left: `calc(${pct(divider.at)} - 3px)`, top: pct(area.y), height: pct(area.h), width: 6 }
    : { top: `calc(${pct(divider.at)} - 3px)`, left: pct(area.x), width: pct(area.w), height: 6 };

  return (
    <div
      role="separator"
      aria-orientation={row ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => useTabs.getState().setSplitSizes(splitId, divider.sizes.map(() => 1))}
      className={["nova-pane group absolute z-10", row ? "cursor-col-resize" : "cursor-row-resize"].join(" ")}
      style={style}
    >
      <div
        className={[
          "absolute bg-[var(--nova-border-strong)] transition-colors group-hover:bg-[var(--nova-accent)]/70",
          row ? "inset-y-0 left-1/2 w-px -translate-x-1/2" : "inset-x-0 top-1/2 h-px -translate-y-1/2",
        ].join(" ")}
      />
    </div>
  );
}
