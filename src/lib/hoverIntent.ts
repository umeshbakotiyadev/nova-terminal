import { useRef, type MouseEvent } from "react";

/**
 * Hover that only counts once the mouse really moves.
 *
 * A list that pops up under a resting mouse pointer would otherwise
 * highlight whatever row lands under it (browsers send hover events when
 * content moves under the cursor), so ⇥ or ⏎ could pick something you never
 * pointed at. Rows only follow the mouse after it has moved a few pixels.
 */
export function useHoverIntent() {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const armed = useRef(false);

  return (e: MouseEvent, action: () => void) => {
    if (!armed.current) {
      if (!origin.current) {
        origin.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) < 4) return;
      armed.current = true;
    }
    action();
  };
}

/**
 * Shows an element's scrollbar only while the pointer is over it. WebKit
 * doesn't repaint scrollbars for CSS :hover alone, so the state is set from
 * script and the scrollbar is rebuilt on the spot (no visible flicker).
 */
export function hoverScrollbar(el: HTMLElement, hovering: boolean) {
  if (hovering) el.dataset.hover = "";
  else delete el.dataset.hover;
  const previous = el.style.overflowY;
  el.style.overflowY = "hidden";
  void el.offsetHeight; // apply, so the scrollbar is recreated with the new look
  el.style.overflowY = previous;
}
