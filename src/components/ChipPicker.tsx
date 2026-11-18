import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Check, Clock, CornerDownLeft, Folder, GitBranch, Search } from "lucide-react";

import { gitBranches, listDir } from "../completion/data";
import { escapePath } from "../completion/engine";
import { joinPath, parentOf, tildify } from "../lib/paths";
import { useHoverIntent } from "../lib/hoverIntent";
import { terminals } from "../lib/registry";
import { useTabs, type Tab } from "../stores/tabs";
import { TERMINAL_FONT } from "./TerminalView";

interface Item {
  key: string;
  section: string;
  label: string;
  detail?: string;
  icon: ReactNode;
  current?: boolean;
  run: () => void;
}

/** Runs a command in a session as if typed into its input box. */
function runIn(tab: Tab, command: string) {
  terminals.get(tab.id)?.write(`\x15${command}\r`);
  useTabs.getState().pushHistory(command);
}

const cdTo = (tab: Tab, path: string) => runIn(tab, `cd ${escapePath(tildify(path)).replace(/^\\~/, "~")}`);

/** Parent folders of `path`, nearest first, ending at / (or the drive, C:/). */
function parents(path: string): string[] {
  const out: string[] = [];
  for (let p = parentOf(path); p !== null; p = parentOf(p)) out.push(p);
  return out;
}

/** Folder picker for the folder chip: up, inside, and recent folders. */
export function FolderPicker({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const recentDirs = useTabs((s) => s.recentDirs);
  const [inside, setInside] = useState<string[]>([]);
  const cwd = tab.cwd;

  useEffect(() => {
    if (!cwd) return;
    let alive = true;
    listDir(cwd)
      .then((entries) => {
        if (alive) setInside(entries.filter((e) => e.dir && !e.name.startsWith(".")).map((e) => e.name));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cwd]);

  const items = useMemo<Item[]>(() => {
    if (!cwd) return [];
    const list: Item[] = [];
    for (const name of inside) {
      const path = joinPath(cwd, name);
      list.push({ key: `in:${path}`, section: "In this folder", label: `${name}/`, icon: <Folder size={13} />, run: () => cdTo(tab, path) });
    }
    for (const path of parents(cwd)) {
      list.push({
        key: `up:${path}`,
        section: "Parent folders",
        label: tildify(path),
        icon: <ArrowUp size={13} />,
        run: () => cdTo(tab, path),
      });
    }
    for (const path of recentDirs) {
      if (path === cwd) continue;
      list.push({ key: `recent:${path}`, section: "Recent", label: tildify(path), icon: <Clock size={13} />, run: () => cdTo(tab, path) });
    }
    return list;
  }, [cwd, inside, recentDirs, tab]);

  return (
    <Picker
      placeholder="Go to folder… (or type a path)"
      items={items}
      onClose={onClose}
      // A typed path that matches nothing: cd straight to it.
      onSubmitText={(text) => runIn(tab, `cd ${text}`)}
    />
  );
}

/** Branch picker for the branch chip: switches with `git switch`. */
export function BranchPicker({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const [branches, setBranches] = useState<string[]>([]);

  useEffect(() => {
    if (!tab.cwd) return;
    let alive = true;
    gitBranches(tab.cwd)
      .then((list) => {
        if (alive) setBranches(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tab.cwd]);

  const items = useMemo<Item[]>(
    () =>
      branches.map((branch) => ({
        key: branch,
        section: "Branches",
        label: branch,
        icon: <GitBranch size={13} />,
        current: branch === tab.branch,
        run: () => runIn(tab, `git switch ${branch}`),
      })),
    [branches, tab],
  );

  return (
    <Picker
      placeholder="Switch branch…"
      items={items}
      onClose={onClose}
      onSubmitText={(text) => runIn(tab, `git switch -c ${text}`)}
      submitHint="create branch"
    />
  );
}

/** Shared popover: filter box, sectioned list, keyboard navigation. */
function Picker({
  placeholder,
  items,
  onClose,
  onSubmitText,
  submitHint = "go",
}: {
  placeholder: string;
  items: Item[];
  onClose: () => void;
  onSubmitText: (text: string) => void;
  submitHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hover = useHoverIntent();

  useEffect(() => inputRef.current?.focus(), []);

  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const choose = (item: Item | undefined) => {
    onClose();
    if (item) item.run();
    else if (query.trim()) onSubmitText(query.trim());
  };

  // Close on a click anywhere outside (no full-window layer that could
  // linger and block clicks).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [onClose]);

  return (
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.1 } }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: "bottom left" }}
        className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[460px] max-w-full overflow-hidden rounded-lg border border-[var(--nova-border-strong)] bg-[var(--nova-panel)] shadow-xl shadow-black/40 backdrop-blur-xl"
      >
        <div className="flex items-center gap-2 border-b border-[var(--nova-border)] px-3">
          <Search size={13} className="shrink-0 text-[var(--nova-faint)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            onBlur={onClose}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((i) => Math.min(i + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(shown[selected]);
              }
            }}
            className="h-9 flex-1 bg-transparent text-[13px] text-[var(--nova-text)] outline-none placeholder:text-[var(--nova-faint)]"
            style={{ fontFamily: TERMINAL_FONT }}
          />
        </div>

        <div ref={listRef} className="max-h-[300px] overflow-y-auto p-1">
          {shown.map((item, i) => {
            const heading = i === 0 || shown[i - 1].section !== item.section ? item.section : null;
            return (
              <div key={item.key}>
                {heading && (
                  <div className="px-2 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-wide text-[var(--nova-faint)]">
                    {heading}
                  </div>
                )}
                <div
                  data-index={i}
                  onMouseMove={(e) => hover(e, () => i !== selected && setSelected(i))}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(item);
                  }}
                  className="relative flex h-7 cursor-default items-center gap-2.5 rounded-md px-2 text-[12.5px] text-[var(--nova-text)]"
                >
                  {i === selected && <span className="absolute inset-0 rounded-md bg-[var(--nova-accent)]/20" />}
                  <span className="relative shrink-0 text-[var(--nova-muted)]">{item.icon}</span>
                  <span className="relative min-w-0 truncate" style={{ fontFamily: TERMINAL_FONT }}>
                    {item.label}
                  </span>
                  {item.detail && (
                    <span className="relative ml-auto shrink-0 pl-3 text-[11px] text-[var(--nova-faint)]">{item.detail}</span>
                  )}
                  {item.current && <Check size={13} className="relative ml-auto shrink-0 text-[var(--nova-accent)]" />}
                </div>
              </div>
            );
          })}
          {shown.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-[var(--nova-muted)]">
              {query.trim() ? (
                <>
                  <CornerDownLeft size={12} /> Press ⏎ to {submitHint}:{" "}
                  <span style={{ fontFamily: TERMINAL_FONT }} className="text-[var(--nova-text)]">
                    {query.trim()}
                  </span>
                </>
              ) : (
                "Nothing here yet."
              )}
            </div>
          )}
        </div>
      </motion.div>
  );
}
