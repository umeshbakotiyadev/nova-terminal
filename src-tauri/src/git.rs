//! Lightweight git info for tabs and the input chips (no git process needed).

use std::fs;
use std::path::{Path, PathBuf};

/// Finds the `.git` folder for `start`, following `gitdir:` files used by
/// worktrees and submodules.
pub(crate) fn find_git_dir(start: &Path) -> Option<PathBuf> {
    let mut dir = Some(start);
    while let Some(d) = dir {
        let dot_git = d.join(".git");
        if dot_git.is_dir() {
            return Some(dot_git);
        }
        if dot_git.is_file() {
            let text = fs::read_to_string(&dot_git).ok()?;
            let target = PathBuf::from(text.trim().strip_prefix("gitdir:")?.trim());
            return Some(if target.is_absolute() {
                target
            } else {
                d.join(target)
            });
        }
        dir = d.parent();
    }
    None
}

/// Current branch name for a folder, the short commit id when detached, or
/// nothing when the folder isn't in a git repository.
#[tauri::command]
pub fn git_branch(path: String) -> Option<String> {
    let git_dir = find_git_dir(Path::new(&path))?;
    let head = fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let head = head.trim();
    match head.strip_prefix("ref: ") {
        Some(reference) => Some(
            reference
                .strip_prefix("refs/heads/")
                .unwrap_or(reference)
                .to_string(),
        ),
        None => Some(head.chars().take(7).collect()),
    }
}
