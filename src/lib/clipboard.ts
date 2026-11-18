import { invoke } from "@tauri-apps/api/core";

import { insideNovaApp } from "./pty";
import { isMac } from "./platform";

/** Clipboard text, without macOS's extra "Paste" confirmation bubble. */
export async function readClipboard(): Promise<string> {
  if (insideNovaApp && isMac) {
    try {
      return await invoke<string>("clipboard_text");
    } catch {
      /* fall back to the web API */
    }
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

export async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable */
  }
}
