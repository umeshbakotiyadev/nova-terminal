//! Shell sessions.
//!
//! Each terminal pane owns one pseudo-terminal (PTY) with your login shell
//! running inside it. Output is streamed to the UI through a Tauri channel;
//! keystrokes and resizes come back through the commands below.
//!
//! Built to stay smooth under heavy output:
//! - a reader thread pulls bytes from the PTY, and a sender thread batches
//!   them (a few milliseconds at most) into large messages, so a flood of
//!   output becomes dozens of messages a second, not thousands; small
//!   output like typing echo is sent straight away;
//! - back-pressure: when the window falls behind drawing, it pauses this
//!   session and the reader stops reading, so the program itself waits
//!   (memory stays flat and ⌃C still works instantly).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, TryRecvError};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

/// Pause switch for a session's reader thread.
#[derive(Default)]
struct Flow {
    paused: Mutex<bool>,
    resumed: Condvar,
}

impl Flow {
    fn set(&self, paused: bool) {
        *self.paused.lock().unwrap() = paused;
        self.resumed.notify_all();
    }

    fn wait_while_paused(&self) {
        let mut paused = self.paused.lock().unwrap();
        while *paused {
            paused = self.resumed.wait(paused).unwrap();
        }
    }
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    flow: Arc<Flow>,
}

/// Read size from the PTY.
const READ_CHUNK: usize = 64 * 1024;
/// Output smaller than this is sent at once (typing stays instant).
const SMALL_OUTPUT: usize = 2 * 1024;
/// Longest a batch waits for more output.
const BATCH_WINDOW: Duration = Duration::from_millis(4);
/// Largest single message to the window.
const MAX_BATCH: usize = 512 * 1024;

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<u32, Session>>,
    next_id: AtomicU32,
}

fn default_shell() -> String {
    if cfg!(windows) {
        // PowerShell 7 when it's installed, else the Windows PowerShell that
        // comes with Windows. ($SHELL is a Unix setting; Git Bash can leave a
        // /usr/bin/bash in it that Windows itself can't start.)
        return if on_path("pwsh.exe") {
            "pwsh.exe"
        } else {
            "powershell.exe"
        }
        .into();
    }
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            return shell;
        }
    }
    if cfg!(target_os = "macos") {
        "/bin/zsh".into()
    } else {
        "/bin/bash".into()
    }
}

/// Whether a program is in one of the PATH folders.
fn on_path(program: &str) -> bool {
    std::env::var_os("PATH")
        .map(|path| {
            // symlink_metadata: Microsoft Store apps are "app execution
            // aliases" that plain metadata can't open.
            std::env::split_paths(&path)
                .any(|dir| std::fs::symlink_metadata(dir.join(program)).is_ok())
        })
        .unwrap_or(false)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Turns the bytes read so far into a string, keeping any incomplete UTF-8
/// sequence at the end of `buf` for the next read.
fn take_utf8(buf: &mut Vec<u8>) -> String {
    let (valid, incomplete_tail) = match std::str::from_utf8(buf) {
        Ok(_) => (buf.len(), false),
        Err(e) => (e.valid_up_to(), e.error_len().is_none()),
    };
    if incomplete_tail {
        let out = String::from_utf8_lossy(&buf[..valid]).into_owned();
        buf.drain(..valid);
        out
    } else {
        let out = String::from_utf8_lossy(buf).into_owned();
        buf.clear();
        out
    }
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// Starts a new shell. Returns the session id used by the other commands.
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    on_data: Channel<String>,
    on_exit: Channel<i32>,
) -> Result<u32, String> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| format!("could not open a pty: {e}"))?;

    let shell = default_shell();
    let name = std::path::Path::new(&shell)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_zsh = name == "zsh";
    let is_powershell = name == "pwsh" || name == "powershell";

    let mut cmd = CommandBuilder::new(&shell);
    if !cfg!(target_os = "windows") {
        // A login shell loads ~/.zprofile etc., so PATH is right even when
        // the app was opened from Finder or the Dock.
        cmd.arg("-l");
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "NovaTerminal");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    if !cfg!(target_os = "windows") && std::env::var_os("LANG").is_none() {
        cmd.env("LANG", "en_US.UTF-8");
    }

    // PowerShell: your profile loads as usual, then Nova's integration. The
    // script is read as text rather than run as a .ps1 file, so it works
    // under Windows' default "scripts are disabled" execution policy too.
    if is_powershell {
        cmd.arg("-NoLogo");
        if let Some(script) = crate::shell::pwsh_integration_file(&app) {
            let path = script.to_string_lossy().replace('\'', "''");
            cmd.arg("-NoExit");
            cmd.arg("-Command");
            cmd.arg(format!(
                ". ([ScriptBlock]::Create([System.IO.File]::ReadAllText('{path}')))"
            ));
        }
    }

    // zsh: load Nova's shell integration (blocks, folder, exit codes) on top
    // of your normal config.
    if is_zsh {
        if let Some(dir) = crate::shell::zsh_integration_dir(&app) {
            if let Some(original) = std::env::var_os("ZDOTDIR") {
                cmd.env("NOVA_ORIG_ZDOTDIR", original);
            }
            cmd.env("ZDOTDIR", &dir);
            cmd.env("NOVA_SHELL_INTEGRATION_DIR", &dir);
        }
    }

    let dir = cwd
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(home_dir);
    if let Some(dir) = dir {
        cmd.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("could not start {shell}: {e}"))?;
    // The child holds its own handle to the slave side.
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = state.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    let flow = Arc::new(Flow::default());
    state.sessions.lock().unwrap().insert(
        id,
        Session {
            master: pair.master,
            writer,
            child,
            flow: flow.clone(),
        },
    );

    // Reader: PTY → queue. Waits whenever the window asks for a pause.
    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(64);
    let reader_flow = flow.clone();
    thread::Builder::new()
        .name(format!("pty-reader-{id}"))
        .spawn(move || {
            let mut buf = vec![0u8; READ_CHUNK];
            loop {
                reader_flow.wait_while_paused();
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
            // Dropping `tx` tells the sender the shell has finished.
        })
        .map_err(|e| e.to_string())?;

    // Sender: queue → window, in batches.
    thread::Builder::new()
        .name(format!("pty-sender-{id}"))
        .spawn(move || {
            let mut pending: Vec<u8> = Vec::with_capacity(READ_CHUNK);
            'outer: while let Ok(first) = rx.recv() {
                let mut batch = first;
                if batch.len() >= SMALL_OUTPUT {
                    // A burst: gather what follows for a few milliseconds.
                    let deadline = Instant::now() + BATCH_WINDOW;
                    while batch.len() < MAX_BATCH {
                        let now = Instant::now();
                        if now >= deadline {
                            break;
                        }
                        match rx.recv_timeout(deadline - now) {
                            Ok(more) => batch.extend_from_slice(&more),
                            Err(RecvTimeoutError::Timeout)
                            | Err(RecvTimeoutError::Disconnected) => break,
                        }
                    }
                } else {
                    // Small output: send now, plus anything already waiting.
                    loop {
                        match rx.try_recv() {
                            Ok(more) => {
                                batch.extend_from_slice(&more);
                                if batch.len() >= MAX_BATCH {
                                    break;
                                }
                            }
                            Err(TryRecvError::Empty) | Err(TryRecvError::Disconnected) => break,
                        }
                    }
                }

                pending.extend_from_slice(&batch);
                let text = take_utf8(&mut pending);
                if !text.is_empty() && on_data.send(text).is_err() {
                    break 'outer;
                }
            }

            // The shell has exited (or the tab was closed): collect the exit code.
            let session = app.state::<PtyState>().sessions.lock().unwrap().remove(&id);
            let code = session
                .and_then(|mut s| s.child.wait().ok())
                .map(|status| status.exit_code() as i32)
                .unwrap_or(0);
            let _ = on_exit.send(code);
        })
        .map_err(|e| e.to_string())?;

    Ok(id)
}

/// Sends keystrokes or pasted text to the shell.
#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("no such session")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|e| e.to_string())
}

/// Tells the shell the window changed size.
#[tauri::command]
pub fn pty_resize(state: State<'_, PtyState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&id).ok_or("no such session")?;
    session
        .master
        .resize(size(cols, rows))
        .map_err(|e| e.to_string())
}

/// Ends a shell when its tab is closed.
#[tauri::command]
pub fn pty_kill(state: State<'_, PtyState>, id: u32) -> Result<(), String> {
    let session = state.sessions.lock().unwrap().remove(&id);
    if let Some(mut s) = session {
        // Let a paused reader run to the end.
        s.flow.set(false);
        let _ = s.child.kill();
        // Reap the process off the UI thread so it doesn't linger as a zombie.
        // Dropping the master closes the pty, which ends the reader thread.
        thread::spawn(move || {
            let _ = s.child.wait();
        });
    }
    Ok(())
}

/// Back-pressure from the window: pause reading while it catches up drawing.
#[tauri::command]
pub fn pty_pause(state: State<'_, PtyState>, id: u32, paused: bool) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&id) {
        session.flow.set(paused);
    }
    Ok(())
}
