import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useDragControls } from "framer-motion";

/** How far the pointer must move before a press becomes a drag. */
const DRAG_THRESHOLD = 6;

/**
 * Drag-to-reorder for a row in a list:
 * - A press only becomes a drag after the pointer really moves, so a click
 *   (even a slightly wobbly trackpad click) never nudges the row.
 * - While pressed or dragged, the row is kept inside its list. Rows at rest
 *   have no bounds: Framer Motion re-fits every bounded row whenever the
 *   window is resized, which left rows shifted on top of each other.
 */
export function useRowDrag(bounds: RefObject<HTMLElement | null>, enabled: boolean) {
  const controls = useDragControls();
  const [armed, setArmed] = useState(false);
  const dragging = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || e.button !== 0) return;
    setArmed(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      stop();
      controls.start(ev);
    };
    const up = () => {
      stop();
      if (!dragging.current) setArmed(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return {
    /** Spread onto the Reorder.Item. */
    props: {
      dragListener: false,
      dragControls: controls,
      dragConstraints: armed ? bounds : undefined,
      onPointerDown,
    },
    onDragStart: () => {
      dragging.current = true;
    },
    onDragEnd: () => {
      dragging.current = false;
      setArmed(false);
    },
  };
}
