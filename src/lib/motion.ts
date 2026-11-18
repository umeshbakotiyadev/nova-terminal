import type { Transition } from "framer-motion";

/** Shared motion presets so the whole app moves the same way. */

/** Fast ease-out, for things appearing (menus, overlays). */
export const easeOut: Transition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] };

/** Snappy spring, for things that move or resize (tabs, panels). */
export const spring: Transition = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 };

/** Calm, quick glide with no overshoot, for list rows and panels. */
export const glide: Transition = { duration: 0.16, ease: [0.25, 0.1, 0.25, 1] };

/** Pop-in for floating panels: fade + slight scale. */
export const pop = {
  initial: { opacity: 0, scale: 0.97, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -4 },
  transition: easeOut,
};

/** Backdrop fade. */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};
