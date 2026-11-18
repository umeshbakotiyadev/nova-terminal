import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { insideNovaApp } from "./pty";

/**
 * True while the window is in macOS full screen. The traffic-light buttons
 * are hidden there, so the title bar gives their space back.
 */
export function useFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!insideNovaApp) return;
    const win = getCurrentWindow();
    let alive = true;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      void win
        .isFullscreen()
        .then((on) => {
          if (alive) setFullscreen(on);
        })
        .catch(() => {});
    };
    // Entering or leaving full screen resizes the window (an animated
    // transition), so check on resize and once more when it has settled.
    const onResize = () => {
      check();
      clearTimeout(settle);
      settle = setTimeout(check, 400);
    };
    check();
    const unlisten = win.onResized(onResize).catch(() => () => {});
    return () => {
      alive = false;
      clearTimeout(settle);
      void unlisten.then((stop) => stop());
    };
  }, []);

  return fullscreen;
}
