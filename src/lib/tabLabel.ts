import { baseName, isRoot, parentOf, tildify } from "./paths";
import type { Tab } from "../stores/tabs";

/** Exit code 130 = stopped with ⌃C: that's you, not an error. */
export const isFailure = (code: number | null) => code !== null && code !== 0 && code !== 130;

export interface TabLabel {
  /** What to show: your custom name, or the automatic label. */
  label: string;
  /** The automatic label: running command, else folder name, else program title. */
  auto: string;
  /** Current folder with ~, if known. */
  folder: string | null;
  /** Where the session is, for the small line under the name: the parent
   *  folder when the name already is the folder ("~/projects"),
   *  otherwise the whole folder. Null when there's nothing more to say. */
  location: string | null;
  /** First word of the running command (`bun`, `pnpm`), if any. */
  runningName: string | null;
  /** The last command failed. */
  failed: boolean;
}

/** "nova" for ~/projects/nova; "~" for home, "C:" for a drive. */
function folderName(folder: string): string {
  return folder === "~" || folder === "/" ? folder : isRoot(folder) ? folder.replace(/\/$/, "") : baseName(folder);
}

/** How a session is named everywhere (tabs panel, top bar, pane headers). */
export function tabLabel(tab: Tab): TabLabel {
  const folder = tab.cwd ? tildify(tab.cwd) : null;
  // While a command runs, the tab is named after it.
  const runningName = tab.running ? tab.runningCommand?.trim().split(/\s+/)[0] ?? null : null;
  const name = folder ? folderName(folder) : null;
  const auto = runningName ?? name ?? tab.title ?? "Terminal";
  const label = tab.customName ?? auto;
  const location = folder ? (label === name ? parentOf(folder) : folder) : null;
  return {
    label,
    auto,
    folder,
    location,
    runningName,
    failed: isFailure(tab.lastExit) && !tab.running,
  };
}
