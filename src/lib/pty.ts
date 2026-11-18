import { Channel, invoke } from "@tauri-apps/api/core";

export interface PtyHandlers {
  onData: (text: string) => void;
  onExit: (code: number) => void;
}

/** True inside the Nova app window; false in a plain browser tab (e.g. localhost:1420). */
export const insideNovaApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Thin wrapper around the Rust shell-session commands. */
export const pty = {
  async spawn(cols: number, rows: number, handlers: PtyHandlers, cwd?: string): Promise<number> {
    if (!insideNovaApp) {
      throw new Error(
        "this page is open in a web browser. Close it and run `pnpm tauri dev` to open the Nova app window.",
      );
    }
    const onData = new Channel<string>();
    onData.onmessage = handlers.onData;
    const onExit = new Channel<number>();
    onExit.onmessage = handlers.onExit;
    return invoke<number>("pty_spawn", { cols, rows, cwd: cwd ?? null, onData, onExit });
  },
  write(id: number, data: string) {
    return invoke<void>("pty_write", { id, data });
  },
  resize(id: number, cols: number, rows: number) {
    return invoke<void>("pty_resize", { id, cols, rows });
  },
  /** Back-pressure: stop / restart reading this shell's output. */
  pause(id: number, paused: boolean) {
    return invoke<void>("pty_pause", { id, paused });
  },
  kill(id: number) {
    return invoke<void>("pty_kill", { id });
  },
};
