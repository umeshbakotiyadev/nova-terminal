import { useEffect } from "react";
import { writeClipboard } from "./clipboard";
import { isMac } from "./platform";
import { terminals } from "./registry";
import { useSettings } from "../stores/settings";
import { useTabs } from "../stores/tabs";

export { isMac, isWindows } from "./platform";

/** Ctrl+Shift+C on Windows and Linux: copies the selected text. */
function copySelection() {
  const el = document.activeElement;
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.classList.contains("xterm-helper-textarea")) {
    const text = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    if (text) void writeClipboard(text);
    return;
  }
  const live = terminals.get(useTabs.getState().activeId);
  if (live?.term.hasSelection()) void writeClipboard(live.term.getSelection());
}

/**
 * Keys the Windows web view acts on by itself (reload, print, find, caret
 * browsing, back). They mean nothing in Nova, and a reload would restart it.
 */
function isBrowserKey(e: KeyboardEvent): boolean {
  if (["F3", "F5", "F7", "BrowserBack", "BrowserForward", "BrowserRefresh"].includes(e.key)) return true;
  if (e.altKey && !e.ctrlKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return true;
  return e.ctrlKey && !e.altKey && ["KeyR", "KeyP", "KeyF", "KeyG", "KeyJ", "KeyU", "KeyS", "KeyO", "KeyN"].includes(e.code);
}

/** Cmd on macOS; Ctrl+Shift elsewhere (so Ctrl+C etc. still reach the shell). */
const hasMod = (e: KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey && e.shiftKey);
/** The second form of a shortcut (split down, tab instead of pane): Shift on
 *  macOS (⌘⇧D), Alt elsewhere, since Shift is already part of Ctrl+Shift. */
const variant = (e: KeyboardEvent) => (isMac ? e.shiftKey : e.altKey);

/** Keys the app handles itself instead of sending them to the shell. */
export function isAppShortcut(e: KeyboardEvent): boolean {
  if (isMac && e.metaKey) return true;
  if (!isMac && e.ctrlKey && e.shiftKey) return true;
  if (e.ctrlKey && e.key === "Tab") return true;
  return false;
}

/** Window-wide keyboard shortcuts. */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tabs = useTabs.getState();
      let handled = true;

      if (e.ctrlKey && e.key === "Tab") {
        tabs.cycle(e.shiftKey ? -1 : 1);
      } else if (!hasMod(e)) {
        handled = false;
      } else if (e.code === "KeyT") {
        tabs.addTab();
      } else if (e.code === "KeyD") {
        // ⌘D splits side by side, ⌘⇧D stacked.
        tabs.splitActive(variant(e) ? "column" : "row");
      } else if (e.code === "KeyW") {
        tabs.closeTab(tabs.activeId);
      } else if (e.code === "Comma") {
        const settings = useSettings.getState();
        settings.setSettingsOpen(!settings.settingsOpen);
      } else if (e.code === "KeyP") {
        tabs.setPaletteOpen(!tabs.paletteOpen);
      } else if (e.code === "KeyB") {
        tabs.toggleSidebar();
      } else if (e.code === "KeyK") {
        terminals.get(tabs.activeId)?.clear();
      } else if (/^Digit[1-9]$/.test(e.code)) {
        tabs.setActiveIndex(Number(e.code.slice(5)) - 1);
      } else if (e.code === "BracketRight" && variant(e)) {
        tabs.cycle(1);
      } else if (e.code === "BracketLeft" && variant(e)) {
        tabs.cycle(-1);
      } else if (e.code === "BracketRight") {
        tabs.focusPane(1);
      } else if (e.code === "BracketLeft") {
        tabs.focusPane(-1);
      } else if (e.altKey && e.key === "ArrowRight") {
        tabs.cycle(1);
      } else if (e.altKey && e.key === "ArrowLeft") {
        tabs.cycle(-1);
      } else if (e.code === "Equal" || e.code === "NumpadAdd") {
        useSettings.getState().zoom(1);
      } else if (e.code === "Minus" || e.code === "NumpadSubtract") {
        useSettings.getState().zoom(-1);
      } else if (e.code === "Digit0") {
        useSettings.getState().zoom(0);
      } else if (!isMac && e.code === "KeyC") {
        copySelection();
      } else {
        // Cmd+C, Cmd+V, Cmd+A, Cmd+Q ... are left to the native menu.
        handled = false;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // After the terminal and input box have had the key (bubbling phase).
    const blockBrowserKeys = (e: KeyboardEvent) => {
      if (isBrowserKey(e)) e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown, true);
    if (!isMac) window.addEventListener("keydown", blockBrowserKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keydown", blockBrowserKeys);
    };
  }, []);
}
