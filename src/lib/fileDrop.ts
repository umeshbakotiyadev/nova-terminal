import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { escapePath } from "../completion/engine";
import { tildify, toSlash } from "./paths";
import { insideNovaApp } from "./pty";
import { inputId, terminals } from "./registry";
import { getDraft, showsInput, useTabs } from "../stores/tabs";

/**
 * Puts dropped files' paths where you're typing:
 * - into the input box at the cursor (a single folder dropped on an empty
 *   input becomes `cd <folder>`, ready to run);
 * - straight to the program while a command is running (vim, ssh, ...).
 */
async function insertPaths(paths: string[]) {
  const { tabs, activeId, setDraft } = useTabs.getState();
  const tab = tabs.find((t) => t.id === activeId);
  if (!tab || paths.length === 0) return;

  const text = paths.map((p) => escapePath(tildify(toSlash(p))).replace(/^\\~/, "~")).join(" ");

  if (!showsInput(tab)) {
    terminals.get(tab.id)?.write(`${text} `);
    return;
  }

  let insert = text;
  const draft = getDraft(tab.id);
  if (!draft.trim() && paths.length === 1) {
    try {
      const [isFolder] = await invoke<boolean[]>("path_kinds", { paths });
      if (isFolder) insert = `cd ${text}`;
    } catch {
      /* keep the plain path */
    }
  }

  const input = document.getElementById(inputId(tab.id)) as HTMLTextAreaElement | null;
  const caret = input && document.activeElement === input ? input.selectionStart : draft.length;
  const before = draft.slice(0, caret);
  const after = draft.slice(caret);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const next = `${before}${lead}${insert} ${after.replace(/^\s+/, "")}`;
  const nextCaret = before.length + lead.length + insert.length + 1;

  setDraft(tab.id, next);
  requestAnimationFrame(() => {
    const el = document.getElementById(inputId(tab.id)) as HTMLTextAreaElement | null;
    el?.focus();
    el?.setSelectionRange(nextCaret, nextCaret);
  });
}

/** Listens for files dragged onto the window; `onHover` drives the drop highlight. */
export function useFileDrop(onHover: (hovering: boolean) => void) {
  useEffect(() => {
    if (!insideNovaApp) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          onHover(true);
        } else if (payload.type === "leave") {
          onHover(false);
        } else if (payload.type === "drop") {
          onHover(false);
          void insertPaths(payload.paths);
        }
      })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // onHover is a state setter, stable for the app's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
