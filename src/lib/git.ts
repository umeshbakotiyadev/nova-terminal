import { invoke } from "@tauri-apps/api/core";

/** Branch name for a folder, or null outside a git repository. */
export async function gitBranch(path: string): Promise<string | null> {
  try {
    return (await invoke<string | null>("git_branch", { path })) ?? null;
  } catch {
    return null;
  }
}
