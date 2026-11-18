import type { Terminal } from "@xterm/xterm";

export interface LiveTerminal {
  term: Terminal;
  /** Re-measures the terminal to fill its pane. */
  fit: () => void;
  /** Sends text to the shell, as if typed. */
  write: (data: string) => void;
  /** Clears the screen and scrollback (⌘K). */
  clear: () => void;
}

/** Live terminals by tab id, so the input box and shortcuts can reach them. */
export const terminals = new Map<string, LiveTerminal>();

/** DOM id of a session's input box (each split pane has its own). */
export const inputId = (tabId: string) => `nova-input-${tabId}`;

/** Puts the keyboard in the input box (if shown) or the terminal. */
export function focusActive(tabId: string, inputShown: boolean) {
  if (inputShown) {
    const input = document.getElementById(inputId(tabId));
    if (input) {
      input.focus();
      return;
    }
  }
  terminals.get(tabId)?.term.focus();
}

// For the UI test harness (development builds only).
if (import.meta.env.DEV) (window as unknown as { __novaTerminals: typeof terminals }).__novaTerminals = terminals;
