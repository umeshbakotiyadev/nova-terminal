import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useHoverIntent } from "../lib/hoverIntent";
import {
  AtSign,
  Command,
  CornerDownRight,
  File,
  Flag,
  Folder,
  GitBranch,
  History,
  Play,
  SquareChevronRight,
  type LucideIcon,
} from "lucide-react";
import { isMac } from "../lib/platform";

import type { Suggestion, SuggestionKind } from "../completion/engine";
import { TERMINAL_FONT } from "./TerminalView";

const ICONS: Record<SuggestionKind, { icon: LucideIcon; color: string }> = {
  // ⌘ is a Mac symbol; elsewhere commands get a prompt icon.
  command: { icon: isMac ? Command : SquareChevronRight, color: "var(--nova-ansi-green)" },
  alias: { icon: AtSign, color: "var(--nova-ansi-magenta)" },
  subcommand: { icon: CornerDownRight, color: "var(--nova-ansi-blue)" },
  option: { icon: Flag, color: "var(--nova-ansi-cyan)" },
  folder: { icon: Folder, color: "var(--nova-ansi-blue)" },
  file: { icon: File, color: "var(--nova-muted)" },
  branch: { icon: GitBranch, color: "var(--nova-ansi-magenta)" },
  script: { icon: Play, color: "var(--nova-ansi-yellow)" },
  history: { icon: History, color: "var(--nova-muted)" },
};

interface Props {
  items: Suggestion[];
  selected: number;
  left: number;
  width: number;
  /** What you've typed, highlighted inside matching history entries. */
  query: string;
  onHover: (index: number) => void;
  onPick: (item: Suggestion) => void;
}

/** Multi-line history entries on one row, with ⏎ where the lines break. */
const oneLine = (text: string) => text.replace(/\\?\n\s*/g, " ⏎ ");

/** Bolds the first place `query` appears in `text`. */
function withMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="font-semibold text-[var(--nova-accent)]">{text.slice(at, at + q.length)}</span>
      {text.slice(at + q.length)}
    </>
  );
}

/** The completion list that pops up above the input box. */
export function SuggestionMenu({ items, selected, left, width, query, onHover, onPick }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const hover = useHoverIntent();

  // Keep the highlighted row in view while arrowing through.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // Section headings only when the list mixes word suggestions and history.
  const sectionOf = (item: Suggestion) => (item.replaceAll ? "History" : "Suggestions");
  const mixed = items.some((i) => i.replaceAll) && items.some((i) => !i.replaceAll);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.1 } }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      style={{ left, width, transformOrigin: "bottom left" }}
      className="absolute bottom-[calc(100%+46px)] z-30 overflow-hidden rounded-lg border border-[var(--nova-border-strong)] bg-[var(--nova-panel)] shadow-xl shadow-black/40 backdrop-blur-xl"
      onMouseDown={(e) => e.preventDefault() /* keep focus in the input */}
    >
      <ul ref={listRef} className="max-h-[260px] overflow-y-auto p-1">
        {items.map((item, i) => {
          const { icon: Icon, color } = ICONS[item.kind];
          const heading =
            mixed && (i === 0 || sectionOf(items[i - 1]) !== sectionOf(item)) ? sectionOf(item) : null;
          return [
            heading && (
              <li
                key={`heading:${heading}`}
                className="px-2 pb-1 pt-1.5 text-[10.5px] font-medium uppercase tracking-wide text-[var(--nova-faint)]"
              >
                {heading}
              </li>
            ),
            <li
              key={`${item.kind}:${item.label}`}
              data-index={i}
              onMouseMove={(e) => hover(e, () => i !== selected && onHover(i))}
              onClick={() => onPick(item)}
              className={[
                "relative flex h-7 cursor-default items-center gap-2.5 rounded-md px-2 text-[12.5px] [&>*:not(:first-child)]:relative",
              ].join(" ")}
            >
              {i === selected && <span className="absolute inset-0 rounded-md bg-[var(--nova-accent)]/20" />}
              <Icon size={13} className="shrink-0" style={{ color }} />
              <span
                className="min-w-0 max-w-[80%] shrink-0 truncate text-[var(--nova-text)]"
                style={{ fontFamily: TERMINAL_FONT }}
              >
                {item.replaceAll ? withMatch(oneLine(item.label), query) : item.label}
              </span>
              {item.description && (
                <span
                  title={item.description}
                  className="ml-auto min-w-0 flex-1 truncate pl-3 text-right text-[11.5px] text-[var(--nova-faint)]"
                >
                  {item.description}
                </span>
              )}
            </li>,
          ];
        })}
      </ul>
    </motion.div>
  );
}
