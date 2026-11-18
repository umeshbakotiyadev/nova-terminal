//! Shell integration scripts.
//!
//! The scripts are compiled into the app and written to the app's data folder
//! the first time a shell starts. zsh is pointed at them through ZDOTDIR; the
//! bootstrap then restores your own ZDOTDIR, so your config loads unchanged.
//! PowerShell runs its script after your profile (see `pty.rs`).

use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

const ZSH_ENV: &str = include_str!("../shell-integration/zsh/zshenv");
const ZSH_NOVA: &str = include_str!("../shell-integration/zsh/nova.zsh");
const PWSH_NOVA: &str = include_str!("../shell-integration/pwsh/nova.ps1");

static ZSH_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
static PWSH_FILE: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Folder holding Nova's zsh integration, written on first use.
pub fn zsh_integration_dir(app: &AppHandle) -> Option<PathBuf> {
    ZSH_DIR
        .get_or_init(|| {
            let dir = app
                .path()
                .app_data_dir()
                .ok()?
                .join("shell-integration")
                .join("zsh");
            std::fs::create_dir_all(&dir).ok()?;
            std::fs::write(dir.join(".zshenv"), ZSH_ENV).ok()?;
            std::fs::write(dir.join("nova.zsh"), ZSH_NOVA).ok()?;
            Some(dir)
        })
        .clone()
}

/// Nova's PowerShell integration script, written on first use.
pub fn pwsh_integration_file(app: &AppHandle) -> Option<PathBuf> {
    PWSH_FILE
        .get_or_init(|| {
            let dir = app
                .path()
                .app_data_dir()
                .ok()?
                .join("shell-integration")
                .join("pwsh");
            std::fs::create_dir_all(&dir).ok()?;
            let file = dir.join("nova.ps1");
            std::fs::write(&file, PWSH_NOVA).ok()?;
            Some(file)
        })
        .clone()
}
