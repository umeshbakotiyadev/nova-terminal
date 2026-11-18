import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronDown, Folder, GitBranch, WandSparkles } from "lucide-react";

import { commandKnown, useCompletionData } from "../completion/data";
import { complete, historyHint, mergeHistory, type Completion, type Suggestion } from "../completion/engine";
import { formatCommand } from "../completion/format";
import { highlight } from "../completion/highlight";
import { tildify } from "../lib/paths";
import { isMac, isWindows } from "../lib/platform";
import { inputId, terminals } from "../lib/registry";
import { useSettings } from "../stores/settings";
import { getDraft, useTabs, type Tab } from "../stores/tabs";
import { BranchPicker, FolderPicker } from "./ChipPicker";
import { SuggestionMenu } from "./SuggestionMenu";
import { TERMINAL_FONT } from "./TerminalView";

const MAX_INPUT_HEIGHT = 220;
/** Pause in typing before suggestions are looked up. */
const TYPING_DELAY_MS = 150;

/**
 * The input box at the bottom of the window: context chips (folder, git
 * branch) above a smart editor. It is hidden while a command runs, so the
 * program gets the whole area and your keystrokes go straight to it.
 */
export function InputBar({ tab }: { tab: Tab }) {
  // Click a chip to change folder or branch.
  const [picker, setPicker] = useState<"folder" | "branch" | null>(null);
  const close = () => setPicker(null);

  return (
    <div data-input-bar className="nova-surface @container relative shrink-0 border-t border-[var(--nova-border)] bg-[var(--nova-chrome)] px-4 pb-3 pt-2.5">
      {/* Chips never spill into a neighbouring pane: a long folder path gives
          way first (cut from the start, so the folder name stays), and in a
          very narrow pane the branch moves to its own line. */}
      <div className="relative mb-2 flex min-h-[24px] min-w-0 flex-wrap items-center gap-1.5">
        {tab.cwd && (
          <Chip
            icon={<Folder size={13} strokeWidth={1.75} />}
            mono
            truncateStart
            className="max-w-fit shrink grow basis-[96px]"
            open={picker === "folder"}
            title="Change folder"
            onClick={() => setPicker(picker === "folder" ? null : "folder")}
          >
            {tildify(tab.cwd)}
          </Chip>
        )}
        {tab.branch && (
          <Chip
            key={tab.branch}
            icon={<GitBranch size={13} strokeWidth={1.75} />}
            className="max-w-full shrink-0"
            open={picker === "branch"}
            title="Switch branch"
            onClick={() => setPicker(picker === "branch" ? null : "branch")}
          >
            {tab.branch}
          </Chip>
        )}
        <AnimatePresence>
          {picker === "folder" && <FolderPicker key="folder" tab={tab} onClose={close} />}
          {picker === "branch" && <BranchPicker key="branch" tab={tab} onClose={close} />}
        </AnimatePresence>
      </div>
      <Editor tab={tab} />
    </div>
  );
}

function Chip({
  icon,
  mono,
  truncateStart,
  className = "",
  open,
  title,
  onClick,
  children,
}: {
  icon: ReactNode;
  mono?: boolean;
  /** Cut long text at the start ("…/project") instead of the end. */
  truncateStart?: boolean;
  className?: string;
  open: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault() /* keep typing focus */}
      onClick={onClick}
      className={[
        "nova-fade-in inline-flex h-6 min-w-0 items-center gap-1.5 overflow-hidden rounded-md border px-2 text-[12px] text-[var(--nova-text)] hover:bg-[var(--nova-hover)]",
        className,
        open
          ? "border-[var(--nova-accent)] bg-[var(--nova-hover)]"
          : "border-[var(--nova-border-strong)] bg-[var(--nova-fill)]",
      ].join(" ")}
      style={mono ? { fontFamily: TERMINAL_FONT } : undefined}
    >
      <span className="shrink-0 text-[var(--nova-muted)]">{icon}</span>
      {truncateStart ? (
        <span className="min-w-0 max-w-[380px] truncate @max-[110px]:hidden" style={{ direction: "rtl" }}>
          <bdi>{children}</bdi>
        </span>
      ) : (
        <span className="min-w-0 max-w-[380px] truncate @max-[110px]:hidden">{children}</span>
      )}
      {/* In a very narrow pane, chips shrink to just their icons. */}
      <ChevronDown
        size={12}
        className={["shrink-0 text-[var(--nova-faint)] transition-transform @max-[200px]:hidden", open ? "rotate-180" : ""].join(" ")}
      />
    </button>
  );
}

interface MenuState {
  completion: Completion;
  selected: number;
  /** You moved through the list with the arrow keys (so ⏎ picks an item). */
  navigated: boolean;
}

/** Width of one character in the input font, for placing the menu. */
function charWidth(fontSize: number): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return fontSize * 0.6;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--nova-mono") || "monospace";
  ctx.font = `${fontSize}px ${family}`;
  return ctx.measureText("M").width || fontSize * 0.6;
}

function Editor({ tab }: { tab: Tab }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLPreElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const fontSize = useSettings((s) => s.fontSize) + 1;
  const suggestWhileTyping = useSettings((s) => s.suggestWhileTyping);
  const syntaxHighlighting = useSettings((s) => s.syntaxHighlighting);
  const novaHistory = useTabs((s) => s.history);
  const shellHistory = useCompletionData((s) => s.shellHistory);
  // Commands from Nova and from your shell's history file (other terminals).
  const history = useMemo(() => mergeHistory(shellHistory, novaHistory), [shellHistory, novaHistory]);
  const known = useCompletionData((s) => s.known);

  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [caretAtEnd, setCaretAtEnd] = useState(true);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const request = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const value = useTabs((s) => s.drafts[tab.id] ?? "");

  const setValue = (draft: string) => useTabs.getState().setDraft(tab.id, draft);

  const placeCaret = (pos: number) =>
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
      setCaretAtEnd(pos === el.value.length);
    });

  // Grey suggestion from history, shown after the caret.
  const hint = caretAtEnd && !menu ? historyHint(value, history) : "";

  const colored = useMemo(
    () => (syntaxHighlighting ? highlight(value, known ? (name) => commandKnown(known, name) : null) : [value]),
    [value, known, syntaxHighlighting],
  );

  // Take the keyboard when the prompt comes back or the tab is switched to
  // (only in the focused pane, so split panes don't steal focus).
  useEffect(() => {
    if (useTabs.getState().activeId === tab.id) ref.current?.focus();
    return () => clearTimeout(typingTimer.current);
  }, [tab.id]);

  // Switching to another app closes the list.
  useEffect(() => {
    const onWindowBlur = () => {
      clearTimeout(typingTimer.current);
      request.current++;
      setMenu(null);
    };
    window.addEventListener("blur", onWindowBlur);
    return () => window.removeEventListener("blur", onWindowBlur);
  }, []);

  // Grow with the text, up to a limit.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [value, fontSize]);

  /** Looks up suggestions for the word at the caret. */
  const suggest = async (text: string, caret: number, explicit: boolean): Promise<Completion | null> => {
    const id = ++request.current;
    let result: Completion | null = null;
    try {
      result = await complete({ text, caret, cwd: tab.cwd, history, explicit });
    } catch {
      result = null;
    }
    if (id !== request.current) return null;
    // The text changed meanwhile (command run, input cleared, history
    // recalled): these suggestions are stale, so don't show them.
    const now = getDraft(tab.id);
    if (now !== text) return null;
    // Only ever show suggestions in the box you're typing in.
    if (document.activeElement !== ref.current || !document.hasFocus()) return null;
    // Don't show a menu whose only item is exactly what you typed.
    const typed = text.slice(result?.start ?? 0, result?.end ?? 0);
    if (!result || (result.items.length === 1 && result.items[0].insert === typed && !explicit)) {
      setMenu(null);
      return null;
    }
    setMenu({ completion: result, selected: 0, navigated: false });
    return result;
  };

  const closeMenu = () => {
    // Also cancel a lookup that's waiting to start (typing delay).
    clearTimeout(typingTimer.current);
    request.current++;
    setMenu(null);
  };

  const accept = (item: Suggestion, completion: Completion) => {
    const insert = item.insert + (item.appendSpace ? " " : "");
    const start = item.replaceAll ? 0 : completion.start;
    const end = item.replaceAll ? value.length : completion.end;
    const next = value.slice(0, start) + insert + value.slice(end);
    const caret = start + insert.length;
    setValue(next);
    closeMenu();
    placeCaret(caret);
    // Picking a folder shows what's inside it right away.
    if (item.kind === "folder") void suggest(next, caret, true);
  };

  const run = () => {
    const live = terminals.get(tab.id);
    if (!live) return;
    closeMenu();
    // ⌃U first clears anything left on the shell's own line.
    if (isWindows) {
      // PowerShell reads a multi-line command line by line (Enter on an
      // unfinished line continues it), so each newline goes as Enter.
      live.write(`\x15${value.replace(/\r?\n/g, "\r")}\r`);
    } else if (value.includes("\n")) {
      // Bracketed paste keeps a multi-line command together as one entry.
      live.write(`\x15\x1b[200~${value}\x1b[201~\r`);
    } else {
      live.write(`\x15${value}\r`);
    }
    useTabs.getState().pushHistory(value);
    setValue("");
    setHistoryIndex(null);
    live.term.scrollToBottom();
  };

  const format = () => {
    const formatted = formatCommand(value);
    if (formatted !== value) {
      setValue(formatted);
      placeCaret(formatted.length);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;

    // ---- Suggestion menu open -------------------------------------------
    if (menu) {
      const count = menu.completion.items.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setMenu({ ...menu, selected: (menu.selected + step + count) % count, navigated: true });
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && menu.navigated && !e.shiftKey)) {
        e.preventDefault();
        accept(menu.completion.items[menu.selected], menu.completion);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
    }

    // Esc also cancels a list that's about to appear.
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }

    // ---- Run, format, accept the grey suggestion -------------------------
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      run();
      return;
    }
    if (e.altKey && e.shiftKey && e.code === "KeyF") {
      e.preventDefault();
      format();
      return;
    }
    if ((e.key === "ArrowRight" || e.key === "End") && atEnd && hint) {
      e.preventDefault();
      const next = value + hint;
      setValue(next);
      placeCaret(next.length);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      clearTimeout(typingTimer.current);
      void suggest(value, el.selectionStart, true).then((result) => {
        // A single match is filled in straight away, like a shell.
        if (result && result.items.length === 1) accept(result.items[0], result);
      });
      return;
    }

    // ---- Control keys ---------------------------------------------------
    if (e.ctrlKey && !e.metaKey && !e.altKey) {
      const live = terminals.get(tab.id);
      if (e.key === "c") {
        e.preventDefault();
        if (!value) live?.write("\x03");
        setValue("");
        setHistoryIndex(null);
        closeMenu();
        return;
      }
      if (e.key === "d" && !value) {
        e.preventDefault();
        live?.write("\x04"); // end of input: exits the shell, like any terminal
        return;
      }
      if (e.key === "l") {
        e.preventDefault();
        live?.clear();
        return;
      }
    }

    // ---- History ---------------------------------------------------------
    if (e.key === "ArrowUp" && !el.value.slice(0, el.selectionStart).includes("\n")) {
      if (history.length === 0) return;
      e.preventDefault();
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setValue(history[next]);
      placeCaret(history[next].length);
      return;
    }
    if (e.key === "ArrowDown" && historyIndex !== null && !el.value.slice(el.selectionEnd).includes("\n")) {
      e.preventDefault();
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(null);
        setValue("");
      } else {
        setHistoryIndex(next);
        setValue(history[next]);
        placeCaret(history[next].length);
      }
    }
  };

  // The coloured text sits exactly under a transparent textarea, so both
  // must share every metric.
  const textStyle: CSSProperties = {
    fontFamily: TERMINAL_FONT,
    fontSize,
    lineHeight: 1.55,
    letterSpacing: 0,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "normal",
    padding: 0,
    // Room under the last line for the red "unknown command" underline.
    paddingBottom: 4,
    margin: 0,
    border: 0,
  };

  // Put the menu under the start of the word being completed.
  // Put the list under the word being completed, but always inside this
  // pane: it narrows in small split panes and shifts left near the edge.
  const available = rowRef.current?.clientWidth ?? 600;
  const menuWidth = Math.max(240, Math.min(600, available));
  let menuLeft = 0;
  if (menu && !menu.completion.items[0]?.replaceAll) {
    const lineStart = value.lastIndexOf("\n", menu.completion.start - 1) + 1;
    const wanted = (menu.completion.start - lineStart) * charWidth(fontSize);
    menuLeft = Math.max(0, Math.min(wanted, available - menuWidth));
  }

  const showFormat = value.length > 60 || value.includes("\\\n");

  return (
    <div ref={rowRef} className="flex items-start gap-3">
      <div className="relative min-w-0 flex-1">
        <AnimatePresence>
          {menu && (
            <SuggestionMenu
            key="menu"
            items={menu.completion.items}
            selected={menu.selected}
            left={menuLeft}
            width={menuWidth}
            query={value}
            onHover={(i) => setMenu({ ...menu, selected: i })}
            onPick={(item) => accept(item, menu.completion)}
          />
          )}
        </AnimatePresence>
        <pre
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden text-[var(--nova-text)]"
          style={textStyle}
        >
          {colored}
          <span className="text-[var(--nova-faint)]">{hint}</span>
          {"\n"}
        </pre>
        <textarea
          id={inputId(tab.id)}
          ref={ref}
          value={value}
          rows={1}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          placeholder="Run a command…"
          onChange={(e) => {
            const text = e.target.value;
            const caret = e.target.selectionStart;
            setValue(text);
            setHistoryIndex(null);
            setCaretAtEnd(caret === text.length);
            clearTimeout(typingTimer.current);
            // Only typing new characters opens the list. Deleting, undoing
            // or cutting just refreshes a list that is already open.
            const kind = (e.nativeEvent as InputEvent).inputType ?? "";
            const typed = kind.startsWith("insert") && kind !== "insertFromPaste";
            if (!text.trim()) {
              closeMenu();
            } else if (menu) {
              typingTimer.current = setTimeout(() => void suggest(text, caret, false), TYPING_DELAY_MS);
            } else if (suggestWhileTyping && typed) {
              typingTimer.current = setTimeout(() => void suggest(text, caret, false), TYPING_DELAY_MS);
            }
          }}
          onSelect={(e) => {
            const el = e.currentTarget;
            setCaretAtEnd(el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
          }}
          onScroll={(e) => {
            if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onBlur={closeMenu}
          // Clicking to move the cursor closes the list.
          onMouseDown={closeMenu}
          onKeyDown={onKeyDown}
          className="relative block min-h-[22px] w-full resize-none bg-transparent text-transparent caret-[var(--nova-accent)] outline-none placeholder:text-[var(--nova-faint)] selection:bg-[var(--nova-accent)]/30"
          style={textStyle}
        />
      </div>
      {showFormat && (
        <div className="mt-0.5 hidden shrink-0 items-center text-[11px] sm:flex">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={format}
            title={`Format command (${isMac ? "⌥⇧F" : "Alt+Shift+F"})`}
            className="flex h-6 items-center gap-1 rounded-md border border-[var(--nova-border-strong)] px-2 text-[var(--nova-muted)] hover:bg-[var(--nova-hover)] hover:text-[var(--nova-text)]"
          >
            <WandSparkles size={12} /> Format
          </button>
        </div>
      )}
    </div>
  );
}
