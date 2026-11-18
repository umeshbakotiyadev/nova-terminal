import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Terminal, type IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";

import { useCompletionData } from "../completion/data";
import { gitBranch } from "../lib/git";
import { parseOsc7 } from "../lib/paths";
import { pty } from "../lib/pty";
import { isFailure } from "../lib/tabLabel";
import { focusActive, terminals } from "../lib/registry";
import { isAppShortcut } from "../lib/shortcuts";
import { writeClipboard } from "../lib/clipboard";
import { isWindows } from "../lib/platform";
import { MONO, terminalTheme } from "../lib/appearance";
import { fontStack, useSettings } from "../stores/settings";
import { getDraft, showsInput, useTabs } from "../stores/tabs";

/** Monospace font for UI text; follows the terminal font setting. */
export const TERMINAL_FONT = MONO;

/** True if output has printable text (not just invisible escape codes). */
const hasVisibleText = (text: string) =>
  // eslint-disable-next-line no-control-regex
  /\S/.test(text.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ""));

/** Pause the shell's output when this much is waiting to be drawn... */
const FLOW_HIGH = 1_000_000;
/** ...and resume once it's down to this. */
const FLOW_LOW = 100_000;

// The size badge is only for window resizing, not for the input box
// appearing or the tabs panel sliding.
let lastWindowResize = 0;
window.addEventListener("resize", () => {
  lastWindowResize = performance.now();
});

interface Props {
  tabId: string;
  initialCwd: string | null;
  active: boolean;
}

/** One shell session drawn with xterm.js (GPU-accelerated through WebGL). */
export function TerminalView({ tabId, initialCwd, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // "120 × 32" badge shown briefly while the window is being resized.
  const [size, setSize] = useState<{ cols: number; rows: number } | null>(null);

  // Create the terminal and its shell once per tab.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { patchTab, closeTab } = useTabs.getState();
    const patch = (p: Parameters<typeof patchTab>[1]) => useTabs.getState().patchTab(tabId, p);

    const createdAt = performance.now();
    const settings = useSettings.getState();
    const term = new Terminal({
      fontFamily: fontStack(settings.fontFamily),
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      cursorWidth: 2,
      allowTransparency: true,
      scrollback: settings.scrollback,
      smoothScrollDuration: 0,
      fastScrollModifier: "alt",
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
      allowProposedApi: true,
      drawBoldTextInBrightColors: false,
      theme: terminalTheme(settings, false),
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        // Cmd+click (Ctrl+click on Windows) opens links.
        if (event.metaKey || event.ctrlKey) void openUrl(uri);
      }),
    );
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";

    term.open(host);

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // No WebGL: xterm falls back to its DOM renderer.
    }

    // Whether you're following the newest output (vs. scrolled up to read).
    // When the pane grows (e.g. the input box hides while a command runs),
    // the browser nudges the scroll position before xterm is resized, which
    // looked like you scrolling up and left new lines below the visible
    // area. Scrolls during a pending resize therefore don't count.
    let following = true;
    let fittedHeight = -1;
    term.onScroll(() => {
      if (host.clientHeight !== fittedHeight) return;
      const buffer = term.buffer.active;
      following = buffer.viewportY >= buffer.baseY;
    });

    const fit = () => {
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        try {
          fitAddon.fit();
        } catch {
          /* not laid out yet */
        }
        fittedHeight = host.clientHeight;
        if (following) term.scrollToBottom();
      }
    };
    fit();

    // At the prompt, Nova's input box is the only place to type:
    // the terminal hides its cursor and passes any key over to the input box.
    // While a command runs, keys go to the program as usual.
    let idle = false;
    const applyIdle = () => {
      const next = showsInput(useTabs.getState().tabs.find((t) => t.id === tabId));
      if (next === idle) return;
      idle = next;
      const current = useSettings.getState();
      term.options.cursorBlink = current.cursorBlink && !next;
      term.options.theme = terminalTheme(current, next);
    };
    const unsubscribe = useTabs.subscribe(applyIdle);

    // Settings changes (theme, font, cursor...) apply to open terminals live.
    const unsubscribeSettings = useSettings.subscribe((now, before) => {
      if (now.fontFamily !== before.fontFamily) term.options.fontFamily = fontStack(now.fontFamily);
      if (now.fontSize !== before.fontSize) term.options.fontSize = now.fontSize;
      if (now.lineHeight !== before.lineHeight) term.options.lineHeight = now.lineHeight;
      if (now.scrollback !== before.scrollback) term.options.scrollback = now.scrollback;
      if (now.cursorStyle !== before.cursorStyle) term.options.cursorStyle = now.cursorStyle;
      if (now.cursorBlink !== before.cursorBlink) term.options.cursorBlink = now.cursorBlink && !idle;
      if (now.themeId !== before.themeId || now.opacity !== before.opacity) {
        term.options.theme = terminalTheme(now, idle);
      }
      fit();
    });

    // Copy on select (Settings → Features).
    term.onSelectionChange(() => {
      if (useSettings.getState().copyOnSelect && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection()).catch(() => {});
      }
    });

    term.attachCustomKeyEventHandler((e) => {
      // App shortcuts (Cmd+T, Cmd+W, ...) are handled by the window, not the shell.
      if (isAppShortcut(e)) return false;
      // Windows Terminal habits: Ctrl+C copies when text is selected (else
      // it stops the program as usual), Ctrl+V pastes.
      if (isWindows && e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.code === "KeyC" && term.hasSelection()) {
          if (e.type === "keydown") {
            void writeClipboard(term.getSelection());
            term.clearSelection();
          }
          e.preventDefault();
          return false;
        }
        // Not handled here, so the web view's own paste fills the terminal.
        if (e.code === "KeyV") return false;
      }
      if (!idle) return true;
      if (e.type === "keydown") {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          useTabs.getState().setDraft(tabId, getDraft(tabId) + e.key);
        }
        focusActive(tabId, true);
      }
      return false;
    });

    let ptyId: number | null = null;
    let queuedChars = 0;
    let sawOutput = false;
    let flowPaused = false;
    let disposed = false;
    const queued: string[] = [];
    const write = (data: string) => {
      if (ptyId === null) queued.push(data);
      else void pty.write(ptyId, data);
    };

    // ---- Shell integration: folder, blocks, exit codes -------------------
    let cwd: string | null = null;
    let blockStart: IMarker | null = null;
    let blockCommand: string | null = null;
    /** Between a command starting (133;C) and finishing (133;D). */
    let commandRunning = false;

    const refreshBranch = () => {
      if (!cwd) return;
      const folder = cwd;
      void gitBranch(folder).then((branch) => {
        if (!disposed && folder === cwd) patch({ branch });
      });
    };

    // Finished commands are drawn as blocks on a layer of our own above the
    // text (xterm's decorations vanish once their first line scrolls away,
    // which hid the red background of long failed output). Each block is
    // anchored to markers, so it follows scrolling, reflow and trimming.
    /** A command that can be pinned on top. */
    interface Pinned {
      start: IMarker;
      command: string | null;
      exit: number;
    }
    interface Block extends Pinned {
      end: IMarker;
      el: HTMLDivElement;
    }
    const blocks: Block[] = [];
    const screen = host.querySelector<HTMLElement>(".xterm-screen");
    const layer = document.createElement("div");
    layer.className = "nova-blocks";
    // While a long block's command has scrolled away, it stays pinned on top.
    const sticky = document.createElement("div");
    sticky.className = "nova-sticky";
    sticky.title = "Scroll to command";
    layer.append(sticky);
    // The command running now gets its divider the moment it starts (so a
    // new command is set apart from the one before it right away); when it
    // finishes, its block takes over the same line.
    const live = document.createElement("div");
    live.className = "nova-block";
    live.style.display = "none";
    layer.insertBefore(live, sticky);
    let livePin: Pinned | null = null;
    let liveFade: ReturnType<typeof setTimeout> | undefined;
    screen?.append(layer);
    let stickyBlock: Pinned | null = null;
    sticky.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (stickyBlock && !stickyBlock.start.isDisposed) term.scrollToLine(Math.max(0, stickyBlock.start.line - 1));
    });

    const removeBlock = (block: Block) => {
      const i = blocks.indexOf(block);
      if (i >= 0) blocks.splice(i, 1);
      block.el.remove();
    };

    const renderBlocks = () => {
      const buffer = term.buffer.active;
      const hidden = buffer.type === "alternate" || !screen;
      layer.style.display = hidden ? "none" : "";
      if (hidden) return;
      const cell = screen.clientHeight / term.rows;
      if (!cell) return;
      const top = buffer.viewportY;
      const bottom = top + term.rows;
      let pinned: Pinned | null = null;
      let prevLast = -1;
      blocks.forEach((block, i) => {
        // The start may already be trimmed from scrollback while the rest remains.
        const first = block.start.isDisposed ? 0 : block.start.line;
        const last = block.end.line;
        const next = blocks[i + 1];
        const nextStart = next ? next.start : blockStart;
        const nextFirst = nextStart && !nextStart.isDisposed ? nextStart.line : Infinity;
        // Where a blank line separates two blocks, each takes half of it, so
        // the divider sits in the middle of the gap.
        const lift = first - prevLast > 1 ? cell / 2 : 0;
        const drop = nextFirst !== Infinity && nextFirst - last > 1 ? cell / 2 : 0;
        prevLast = last;
        if (last < top || first >= bottom) {
          block.el.style.display = "none";
          return;
        }
        block.el.style.display = "";
        // No divider above the first block at the top (e.g. after `clear`).
        block.el.classList.toggle("nova-block-top", i === 0 && first <= 1);
        block.el.style.transform = `translateY(${(first - top) * cell - lift}px)`;
        block.el.style.height = `${(last - first + 1) * cell + lift + drop}px`;
        if (first < top && last > top + 1 && block.command) pinned = block;
      });

      // The running command: its divider (half a blank line above it, like
      // a block's), and its command pinned while its output scrolls by.
      const runStart = commandRunning && blockStart && !blockStart.isDisposed ? blockStart : null;
      const runFirst = runStart ? runStart.line : -1;
      const runLast = buffer.baseY + buffer.cursorY;
      if (!runStart || runLast < top || runFirst >= bottom) {
        live.style.display = "none";
      } else {
        const lift = runFirst - prevLast > 1 ? cell / 2 : 0;
        live.style.display = "";
        live.classList.toggle("nova-block-top", blocks.length === 0 && runFirst <= 1);
        live.style.transform = `translateY(${(runFirst - top) * cell - lift}px)`;
        live.style.height = `${(runLast - runFirst + 1) * cell + lift}px`;
      }
      const runCommand = blockCommand?.trim();
      if (runStart && !pinned && runFirst < top && runLast > top + 1 && runCommand) {
        if (livePin?.start !== runStart) livePin = { start: runStart, command: runCommand, exit: 0 };
        pinned = livePin;
      }

      if (pinned !== stickyBlock) {
        stickyBlock = pinned;
        sticky.classList.toggle("is-shown", !!pinned);
        if (pinned) {
          const { command, exit } = pinned as Pinned;
          sticky.textContent = command;
          sticky.dataset.exit = isFailure(exit) ? `exit ${exit}` : "";
        }
      }
      if (stickyBlock) {
        sticky.style.height = `${cell}px`;
        sticky.style.fontFamily = term.options.fontFamily ?? "";
        sticky.style.fontSize = `${term.options.fontSize}px`;
      }
    };
    term.onRender(renderBlocks);
    term.onScroll(renderBlocks);

    /** Marks the finished command's lines as one block (red if it failed). */
    const addBlock = (exit: number) => {
      const start = blockStart;
      const command = blockCommand;
      // Its divider is already on screen: the block takes it over as is.
      const handOff = live.style.display !== "none";
      commandRunning = false;
      livePin = null;
      live.style.display = "none";
      blockStart = null;
      blockCommand = null;
      if (!start || start.isDisposed) return;
      const buffer = term.buffer.active;
      // The block ends on the last line with output (not the empty line the
      // cursor is on).
      const end = term.registerMarker(buffer.cursorX === 0 ? -1 : 0);
      if (!end || end.line < start.line) {
        end?.dispose();
        start.dispose();
        return;
      }
      const el = document.createElement("div");
      el.className = "nova-block";
      if (isFailure(exit)) {
        el.classList.add("nova-block-failed", "nova-block-new");
        el.dataset.exit = `exit ${exit}`;
      } else if (!handOff) {
        el.classList.add("nova-block-new");
      }
      setTimeout(() => el.classList.remove("nova-block-new"), 700);
      layer.insertBefore(el, sticky);
      const block: Block = { start, end, command: command?.trim() || null, exit, el };
      blocks.push(block);
      end.onDispose(() => removeBlock(block));
      renderBlocks();
    };

    /** Clears the screen and scrollback (⌘K), keeping the current prompt usable. */
    const clear = () => {
      const hadStart = !!blockStart && !blockStart.isDisposed;
      term.clear(); // drops every marker, and with them the blocks
      for (const block of [...blocks]) removeBlock(block);
      // The prompt (or running command) now starts at the top.
      if (hadStart) blockStart = term.registerMarker(-term.buffer.active.cursorY) ?? null;
      renderBlocks();
    };

    // `clear` run in the shell erases the screen: drop the blocks drawn there.
    term.parser.registerCsiHandler({ final: "J" }, (params) => {
      // Full-screen apps (vim, htop) clear their own screen, not your blocks.
      if (term.buffer.active.type === "alternate") return false;
      if (params[0] === 2 || params[0] === 3) {
        const buffer = term.buffer.active;
        for (const block of [...blocks]) {
          if (params[0] === 3 || block.end.line >= buffer.baseY) {
            block.start.dispose();
            block.end.dispose(); // removes the block
          }
        }
        blockStart?.dispose();
        blockStart = null;
        renderBlocks();
      }
      return false; // let xterm erase as usual
    });

    term.parser.registerOscHandler(7, (data) => {
      const path = parseOsc7(data);
      if (path && path !== cwd) {
        cwd = path;
        patch({ cwd: path });
        useTabs.getState().rememberDir(path);
        refreshBranch();
      }
      return true;
    });

    // Nova's own channel: PATH and alias names, for input-box suggestions.
    term.parser.registerOscHandler(6973, (data) => {
      const split = data.indexOf(";");
      const kind = data.slice(0, split);
      const value = data.slice(split + 1);
      const completion = useCompletionData.getState();
      if (kind === "path") completion.setPath(value);
      else if (kind === "aliases") completion.setAliases(value.split(" ").filter(Boolean));
      else if (kind === "histfile") completion.setHistFile(value);
      else if (kind === "commands") completion.setShellCommands(value.split(" ").filter(Boolean));
      return true;
    });

    term.parser.registerOscHandler(133, (data) => {
      const [kind, ...rest] = data.split(";");
      const arg = rest.join(";");
      switch (kind) {
        case "A": // prompt is about to be drawn
          if (!useTabs.getState().tabs.find((t) => t.id === tabId)?.integrated) {
            patch({ integrated: true });
          }
          break;
        case "B": // the command line starts here
          commandRunning = false;
          blockStart?.dispose();
          blockStart = term.registerMarker(0) ?? null;
          break;
        case "C": // a command started running
          blockCommand = arg || null;
          commandRunning = true;
          // Its divider fades in once (not again when scrolled back to).
          live.classList.add("nova-block-new");
          clearTimeout(liveFade);
          liveFade = setTimeout(() => live.classList.remove("nova-block-new"), 700);
          renderBlocks();
          patch({ running: true, runningCommand: arg || null });
          break;
        case "D": {
          // the command finished
          const code = Number.parseInt(arg, 10);
          const exitCode = Number.isNaN(code) ? 0 : code;
          addBlock(exitCode);
          patch({ running: false, runningCommand: null, lastExit: exitCode });
          refreshBranch(); // `git checkout` may have changed it
          break;
        }
      }
      return true;
    });

    term.buffer.onBufferChange((buffer) => patch({ altScreen: buffer.type === "alternate" }));
    term.onTitleChange((title) => patch({ title: title.trim() || null }));

    // ---- Wire the terminal to the shell ----------------------------------
    // While Nova's input box is showing, keys are sent there (see the key
    // handler above), and so is text pasted into the terminal. The
    // terminal's automatic replies (cursor position, device info) still go
    // to the shell: PowerShell and Windows' ConPTY wait for them.
    term.onData((data) => {
      const pasted = data.startsWith("\x1b[200~") || !data.startsWith("\x1b");
      if (!idle || !pasted) {
        write(data);
        return;
      }
      const text = data.replace(/\x1b\[20[01]~/g, "").replace(/\r\n?/g, "\n");
      useTabs.getState().setDraft(tabId, getDraft(tabId) + text);
      focusActive(tabId, true);
    });
    let sizeTimer: ReturnType<typeof setTimeout> | undefined;
    term.onResize(({ cols, rows }) => {
      // Not while the window is still opening (it settles its size then).
      const now = performance.now();
      // Only in the focused pane, so a split window shows one badge.
      const focused = useTabs.getState().activeId === tabId;
      if (activeRef.current && focused && !disposed && now - lastWindowResize < 1000 && now - createdAt > 1500) {
        setSize({ cols, rows });
        clearTimeout(sizeTimer);
        sizeTimer = setTimeout(() => setSize(null), 900);
      }
      if (ptyId !== null) void pty.resize(ptyId, cols, rows);
    });

    pty
      .spawn(
        term.cols,
        term.rows,
        {
          onData: (text) => {
            // The first visible output hides the pane's welcome hint.
            if (!sawOutput && hasVisibleText(text)) {
              sawOutput = true;
              patch({ hasOutput: true });
            }
            // Back-pressure: if drawing falls behind (a flood of output),
            // pause reading the shell until xterm catches up.
            queuedChars += text.length;
            term.write(text, () => {
              queuedChars -= text.length;
              if (flowPaused && queuedChars < FLOW_LOW && ptyId !== null) {
                flowPaused = false;
                void pty.pause(ptyId, false);
              }
            });
            if (!flowPaused && queuedChars > FLOW_HIGH && ptyId !== null) {
              flowPaused = true;
              void pty.pause(ptyId, true);
            }
          },
          onExit: () => {
            if (!disposed) closeTab(tabId);
          },
        },
        initialCwd ?? undefined,
      )
      .then((id) => {
        if (disposed) {
          void pty.kill(id);
          return;
        }
        ptyId = id;
        for (const data of queued.splice(0)) void pty.write(id, data);
        // The window may have changed size while the shell was starting.
        void pty.resize(id, term.cols, term.rows);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        term.write(`\r\n\x1b[31mNova could not start your shell: ${message}\x1b[0m\r\n`);
      });

    // While panels animate or the window is dragged, refit at most every
    // 120 ms and once more when it settles, so the shell isn't flooded with
    // size changes and the text doesn't jitter.
    let fitTimer: ReturnType<typeof setTimeout> | undefined;
    let lastFit = 0;
    const scheduleFit = () => {
      const now = performance.now();
      if (now - lastFit > 120) {
        lastFit = now;
        fit();
      }
      clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        lastFit = performance.now();
        fit();
      }, 80);
    };
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(host);
    terminals.set(tabId, { term, fit, write, clear });

    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeSettings();
      clearTimeout(fitTimer);
      clearTimeout(sizeTimer);
      observer.disconnect();
      terminals.delete(tabId);
      if (ptyId !== null) void pty.kill(ptyId);
      term.dispose();
    };
    // initialCwd only matters when the shell starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Re-measure when this tab becomes the visible one.
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => terminals.get(tabId)?.fit());
    return () => cancelAnimationFrame(frame);
  }, [active, tabId]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      <AnimatePresence>
        {size && active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--nova-border-strong)] bg-[var(--nova-panel)] px-4 py-2 text-[13px] tabular-nums text-[var(--nova-text)] shadow-lg"
            style={{ fontFamily: TERMINAL_FONT }}
          >
            {size.cols} × {size.rows}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
