/**
 * Split-pane layouts. A tab ("group") holds a tree: leaves are panes (one
 * shell session each), branches split their area in a row (side by side) or
 * a column (stacked), with a size fraction per child.
 */

export type Dir = "row" | "column";

export type Layout =
  | { type: "pane"; id: string }
  | { type: "split"; id: string; dir: Dir; children: Layout[]; sizes: number[] };

export interface Group {
  id: string;
  layout: Layout;
  /** The pane that had focus last in this tab. */
  focusedId: string;
  /** The tab group ("section") this tab is filed under, if any. */
  sectionId?: string | null;
}

let splitCounter = 0;
const newSplitId = () => `split-${++splitCounter}`;

export const pane = (id: string): Layout => ({ type: "pane", id });

/** Pane ids in reading order (left→right, top→bottom). */
export function paneIds(layout: Layout): string[] {
  return layout.type === "pane" ? [layout.id] : layout.children.flatMap(paneIds);
}

const normalize = (sizes: number[]) => {
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return sizes.map((s) => s / total);
};

/** Puts a new pane next to `targetId`, splitting in `dir`. */
export function insertBeside(layout: Layout, targetId: string, newId: string, dir: Dir): Layout {
  if (layout.type === "pane") {
    if (layout.id !== targetId) return layout;
    return { type: "split", id: newSplitId(), dir, children: [layout, pane(newId)], sizes: [0.5, 0.5] };
  }
  const index = layout.children.findIndex((c) => c.type === "pane" && c.id === targetId);
  if (index !== -1 && layout.dir === dir) {
    // Same direction: add a sibling, sharing the target's space.
    const children = [...layout.children];
    const sizes = [...layout.sizes];
    children.splice(index + 1, 0, pane(newId));
    const half = sizes[index] / 2;
    sizes.splice(index, 1, half, half);
    return { ...layout, children, sizes };
  }
  return { ...layout, children: layout.children.map((c) => insertBeside(c, targetId, newId, dir)) };
}

/** Removes a pane; splits left with one child collapse into it. */
export function removePane(layout: Layout, id: string): Layout | null {
  if (layout.type === "pane") return layout.id === id ? null : layout;
  const kept: Layout[] = [];
  const sizes: number[] = [];
  layout.children.forEach((child, i) => {
    const next = removePane(child, id);
    if (next) {
      kept.push(next);
      sizes.push(layout.sizes[i]);
    }
  });
  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0];
  return { ...layout, children: kept, sizes: normalize(sizes) };
}

export function setSizes(layout: Layout, splitId: string, sizes: number[]): Layout {
  if (layout.type === "pane") return layout;
  if (layout.id === splitId) return { ...layout, sizes: normalize(sizes) };
  return { ...layout, children: layout.children.map((c) => setSizes(c, splitId, sizes)) };
}

/** Area as fractions (0–1) of the tab's content area. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Divider {
  splitId: string;
  /** Sits between child `index` and `index + 1`. */
  index: number;
  dir: Dir;
  /** The split's whole area (for turning a drag into new sizes). */
  area: Rect;
  sizes: number[];
  /** Position of the line along the split's axis (fraction of the tab). */
  at: number;
}

export interface Placement {
  panes: Map<string, Rect>;
  dividers: Divider[];
}

/** Works out where every pane and divider goes. */
export function place(layout: Layout, area: Rect = { x: 0, y: 0, w: 1, h: 1 }, out?: Placement): Placement {
  const result: Placement = out ?? { panes: new Map(), dividers: [] };
  if (layout.type === "pane") {
    result.panes.set(layout.id, area);
    return result;
  }
  let offset = 0;
  layout.children.forEach((child, i) => {
    const size = layout.sizes[i];
    const rect =
      layout.dir === "row"
        ? { x: area.x + offset * area.w, y: area.y, w: size * area.w, h: area.h }
        : { x: area.x, y: area.y + offset * area.h, w: area.w, h: size * area.h };
    place(child, rect, result);
    offset += size;
    if (i < layout.children.length - 1) {
      result.dividers.push({
        splitId: layout.id,
        index: i,
        dir: layout.dir,
        area,
        sizes: layout.sizes,
        at: layout.dir === "row" ? area.x + offset * area.w : area.y + offset * area.h,
      });
    }
  });
  return result;
}

// ---- Saving and restoring ---------------------------------------------------

export type SavedLayout =
  | { type: "pane"; folder: string | null; name: string | null }
  | { type: "split"; dir: Dir; sizes: number[]; children: SavedLayout[] };

/** Rebuilds a saved layout, creating a session for each pane with `makePane`. */
export function restoreLayout(saved: SavedLayout, makePane: (folder: string | null, name: string | null) => string): Layout {
  if (saved.type === "pane") return pane(makePane(saved.folder ?? null, saved.name ?? null));
  const children = (Array.isArray(saved.children) ? saved.children : []).map((c) => restoreLayout(c, makePane));
  if (children.length === 0) return pane(makePane(null, null));
  if (children.length === 1) return children[0];
  const sizes =
    Array.isArray(saved.sizes) && saved.sizes.length === children.length
      ? normalize(saved.sizes)
      : children.map(() => 1 / children.length);
  return { type: "split", id: newSplitId(), dir: saved.dir === "column" ? "column" : "row", children, sizes };
}

export function saveLayout(layout: Layout, info: (id: string) => { folder: string | null; name: string | null }): SavedLayout {
  if (layout.type === "pane") return { type: "pane", ...info(layout.id) };
  return {
    type: "split",
    dir: layout.dir,
    sizes: layout.sizes,
    children: layout.children.map((c) => saveLayout(c, info)),
  };
}
