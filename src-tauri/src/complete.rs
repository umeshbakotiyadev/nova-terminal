//! Data for the input box's suggestions: installed commands, folder
//! contents, git branches and package.json scripts. All read straight from
//! disk, without running any process.

use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::git::find_git_dir;

const MAX_ENTRIES: usize = 2000;

#[derive(Serialize)]
pub struct DirEntry {
    name: String,
    dir: bool,
}

#[derive(Serialize)]
pub struct Script {
    name: String,
    command: String,
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

/// Every executable on the shell's PATH (the PATH comes from the shell
/// itself, so it matches what your commands will actually find). On Windows
/// a command is a file with a runnable extension (git.exe, npm.cmd), listed
/// without it.
#[tauri::command]
pub async fn list_commands(path_var: String) -> Vec<String> {
    let windows = cfg!(windows);
    let separator = if windows { ';' } else { ':' };
    let extensions = if windows {
        runnable_extensions()
    } else {
        Vec::new()
    };
    let mut names = BTreeSet::new();
    for dir in path_var.split(separator).filter(|d| !d.is_empty()) {
        let Ok(entries) = fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Some(name) = entry.file_name().to_str().map(str::to_string) else {
                continue;
            };
            if windows {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(true) {
                    continue;
                }
                let lower = name.to_ascii_lowercase();
                if let Some(ext) = extensions
                    .iter()
                    .find(|ext| lower.len() > ext.len() && lower.ends_with(ext.as_str()))
                {
                    names.insert(name[..name.len() - ext.len()].to_string());
                }
            } else if is_executable(&entry.path()) {
                names.insert(name);
            }
        }
    }
    names.into_iter().collect()
}

/// Extensions Windows runs without being typed (PATHEXT), plus PowerShell
/// scripts, in lower case: [".com", ".exe", ".bat", ".cmd", ..., ".ps1"].
fn runnable_extensions() -> Vec<String> {
    let pathext = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    let mut extensions: Vec<String> = pathext
        .split(';')
        .filter(|ext| ext.starts_with('.') && ext.len() > 1)
        .map(|ext| ext.to_ascii_lowercase())
        .collect();
    extensions.push(".ps1".into());
    extensions
}

/// Files and folders in `path`, folders first.
#[tauri::command]
pub async fn list_dir(path: String) -> Vec<DirEntry> {
    let Ok(entries) = fs::read_dir(&path) else {
        return Vec::new();
    };
    let mut out: Vec<DirEntry> = entries
        .flatten()
        .take(MAX_ENTRIES)
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_string();
            // Follow symlinks so a linked folder still completes as a folder.
            let dir = entry.path().is_dir();
            Some(DirEntry { name, dir })
        })
        .collect();
    out.sort_by(|a, b| {
        b.dir
            .cmp(&a.dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    out
}

fn collect_refs(dir: &Path, prefix: &str, out: &mut BTreeSet<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let path = entry.path();
        if path.is_dir() {
            collect_refs(&path, &format!("{prefix}{name}/"), out);
        } else {
            out.insert(format!("{prefix}{name}"));
        }
    }
}

/// Local branch names of the repository containing `cwd`.
#[tauri::command]
pub async fn git_branches(cwd: String) -> Vec<String> {
    let Some(git_dir) = find_git_dir(Path::new(&cwd)) else {
        return Vec::new();
    };
    // Worktrees keep shared refs in the main repository ("commondir").
    let common: PathBuf = fs::read_to_string(git_dir.join("commondir"))
        .ok()
        .map(|c| {
            let p = PathBuf::from(c.trim());
            if p.is_absolute() {
                p
            } else {
                git_dir.join(p)
            }
        })
        .unwrap_or_else(|| git_dir.clone());

    let mut branches = BTreeSet::new();
    collect_refs(&common.join("refs").join("heads"), "", &mut branches);
    if let Ok(packed) = fs::read_to_string(common.join("packed-refs")) {
        for line in packed.lines() {
            if let Some((_, reference)) = line.split_once(' ') {
                if let Some(branch) = reference.strip_prefix("refs/heads/") {
                    branches.insert(branch.to_string());
                }
            }
        }
    }
    branches.into_iter().collect()
}

/// `scripts` from the nearest package.json at or above `cwd`.
#[tauri::command]
pub async fn package_scripts(cwd: String) -> Vec<Script> {
    let mut dir = Some(Path::new(&cwd));
    while let Some(d) = dir {
        let file = d.join("package.json");
        if file.is_file() {
            let Ok(text) = fs::read_to_string(&file) else {
                return Vec::new();
            };
            let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
                return Vec::new();
            };
            return json
                .get("scripts")
                .and_then(|s| s.as_object())
                .map(|scripts| {
                    scripts
                        .iter()
                        .map(|(name, command)| Script {
                            name: name.clone(),
                            command: command.as_str().unwrap_or_default().to_string(),
                        })
                        .collect()
                })
                .unwrap_or_default();
        }
        dir = d.parent();
    }
    Vec::new()
}

/// For each dropped path: is it a folder?
#[tauri::command]
pub async fn path_kinds(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).is_dir()).collect()
}

const MAX_HISTORY: usize = 5000;

/// zsh stores some bytes "metafied" (0x83 followed by byte ^ 32).
fn unmetafy(bytes: &[u8]) -> String {
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x83 && i + 1 < bytes.len() {
            out.push(bytes[i + 1] ^ 32);
            i += 2;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Your existing shell history (zsh, bash or PowerShell), oldest first,
/// without duplicates, so commands you ran in other terminals show up in
/// Nova too.
#[tauri::command]
pub async fn shell_history(path: Option<String>) -> Vec<String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    let mut candidates: Vec<PathBuf> = path.map(PathBuf::from).into_iter().collect();
    if let Some(home) = &home {
        candidates.push(home.join(".zsh_history"));
        candidates.push(home.join(".bash_history"));
    }
    let Some(file) = candidates.into_iter().find(|p| p.is_file()) else {
        return Vec::new();
    };
    let Ok(bytes) = fs::read(&file) else {
        return Vec::new();
    };
    // PowerShell's (PSReadLine's ConsoleHost_history.txt) is plain UTF-8, with
    // a backtick ending each line of a multi-line command.
    let powershell = file
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.ends_with("_history.txt"))
        .unwrap_or(false);
    let text = if powershell {
        String::from_utf8_lossy(&bytes).into_owned()
    } else {
        unmetafy(&bytes)
    };
    let continues = |line: &str| {
        if powershell {
            line.ends_with('`')
        } else {
            line.ends_with('\\')
        }
    };
    // PowerShell's backticks are only there for the file, not part of the command.
    let strip = |line: &str| {
        if powershell {
            line.trim_end_matches('`').to_string()
        } else {
            line.to_string()
        }
    };

    let mut entries: Vec<String> = Vec::new();
    let mut pending: Option<String> = None;
    for line in text.lines() {
        // A command that continues on the next line (ends with a backslash).
        if let Some(mut command) = pending.take() {
            command.push('\n');
            command.push_str(&strip(line));
            if continues(line) {
                pending = Some(command);
            } else {
                entries.push(command);
            }
            continue;
        }
        // zsh extended format: ": 1699999999:0;git status"
        let command = if !powershell && line.starts_with(": ") {
            line.split_once(';').map(|(_, c)| c).unwrap_or("")
        } else if !powershell
            && line.starts_with('#')
            && line[1..].chars().all(|c| c.is_ascii_digit())
        {
            "" // bash timestamp line
        } else {
            line
        };
        if continues(command) {
            pending = Some(strip(command));
        } else if !command.trim().is_empty() {
            entries.push(command.to_string());
        }
    }
    if let Some(command) = pending {
        entries.push(command);
    }

    // Keep only the newest copy of each command, and skip garbled entries
    // (stray key codes like backspace saved into the file).
    let mut seen = HashSet::new();
    let mut unique: Vec<String> = entries
        .into_iter()
        .rev()
        .filter(|c| {
            !c.chars()
                .any(|ch| ch.is_control() && ch != '\n' && ch != '\t')
        })
        .filter(|c| seen.insert(c.clone()))
        .take(MAX_HISTORY)
        .collect();
    unique.reverse();
    unique
}
