import { homeDir } from "@tauri-apps/api/path";
import { isWindows } from "./platform";
import { insideNovaApp } from "./pty";

let home: string | null = null;

/**
 * Nova writes paths with `/` everywhere. Windows accepts it too, so
 * C:\Users\me becomes C:/Users/me.
 */
export const toSlash = (path: string) => (isWindows ? path.replace(/\\/g, "/") : path);

/** The top of a path: "/", or a drive on Windows ("C:/"). */
export const isRoot = (path: string) => path === "/" || /^[A-Za-z]:\/?$/.test(path);

/** Windows paths ignore letter case (C:/Users = c:/users). */
const samePath = (a: string, b: string) => (isWindows ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Reads the home folder once at startup so paths can be shown with ~. */
export async function initHome() {
  if (!insideNovaApp) return;
  try {
    home = toSlash(await homeDir()).replace(/\/+$/, "");
  } catch {
    home = null;
  }
}

/** Your home folder, once known. */
export const homePath = () => home;

/** /Users/me/projects → ~/projects (C:/Users/me/projects → ~/projects on Windows) */
export function tildify(path: string): string {
  if (!home) return path;
  if (samePath(path, home)) return "~";
  if (samePath(path.slice(0, home.length + 1), home + "/")) return "~" + path.slice(home.length);
  return path;
}

/** Last folder name, e.g. "nova-terminal" ("C:" for a drive). */
export function baseName(path: string): string {
  const parts = toSlash(path).split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "/";
}

/** `dir` + `name`, with one `/` between them ("C:/" + "dev" = "C:/dev"). */
export const joinPath = (dir: string, name: string) => (dir.endsWith("/") ? dir + name : `${dir}/${name}`);

/** The folder above: "~/projects" for "~/projects/nova", "C:/" for "C:/Users"; null at the top. */
export function parentOf(path: string): string | null {
  if (isRoot(path) || path === "~") return null;
  const trimmed = path.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  if (cut < 0) return null;
  const parent = trimmed.slice(0, cut);
  if (parent === "") return "/";
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}

/** Parses an OSC 7 payload: file://host/path → /path (file://host/C:/dev → C:/dev) */
export function parseOsc7(data: string): string | null {
  if (!data.startsWith("file://")) return null;
  const rest = data.slice("file://".length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const raw = rest.slice(slash);
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    path = raw;
  }
  return /^\/[A-Za-z]:(\/|$)/.test(path) ? path.slice(1) : path;
}
