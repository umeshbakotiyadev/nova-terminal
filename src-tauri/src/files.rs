//! Reading and writing the backup file you pick in the Save / Open dialogs.

const MAX_BYTES: u64 = 20 * 1024 * 1024;

#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Couldn't save {path}: {e}"))
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let size = std::fs::metadata(&path)
        .map_err(|e| format!("Couldn't open {path}: {e}"))?
        .len();
    if size > MAX_BYTES {
        return Err("That file is too large to be a Nova backup.".into());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Couldn't read {path}: {e}"))
}
