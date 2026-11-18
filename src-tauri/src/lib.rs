mod clipboard;
mod complete;
mod files;
mod git;
#[cfg(target_os = "macos")]
mod menu;
mod pty;
mod shell;
mod window_fx;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default());
    // macOS keeps its menu in the top bar of the screen. On Windows (and
    // Linux) a menu would sit inside the window, under Nova's own title bar.
    #[cfg(target_os = "macos")]
    let builder = builder.menu(|app| menu::build(app));
    builder
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_pause,
            git::git_branch,
            complete::list_commands,
            complete::list_dir,
            complete::git_branches,
            complete::package_scripts,
            complete::path_kinds,
            complete::shell_history,
            files::write_text_file,
            files::read_text_file,
            window_fx::set_blur_radius,
            clipboard::clipboard_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nova Terminal");
}
