use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

/// Shared log file handle for writing from multiple contexts.
type LogHandle = Arc<Mutex<std::fs::File>>;

/// Create ~/Library/Logs/Orthrus/orthrus.log and return a shared handle.
fn setup_log_file() -> Option<LogHandle> {
    let log_dir = dirs::home_dir()
        .map(|h| h.join("Library/Logs/Orthrus"))
        .unwrap_or_else(|| PathBuf::from("/tmp/orthrus-logs"));

    if let Err(e) = fs::create_dir_all(&log_dir) {
        eprintln!("[log] failed to create log dir: {e}");
        return None;
    }

    let log_path = log_dir.join("orthrus.log");
    match OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
    {
        Ok(file) => {
            eprintln!("[log] writing to {}", log_path.display());
            Some(Arc::new(Mutex::new(file)))
        }
        Err(e) => {
            eprintln!("[log] failed to open log file: {e}");
            None
        }
    }
}

/// Write a timestamped line to the log file (and stderr as fallback).
fn log(handle: &Option<LogHandle>, msg: &str) {
    let now = chrono::Local::now().format("%H:%M:%S%.3f");
    let line = format!("[{now}] {msg}\n");
    eprintln!("{}", msg);
    if let Some(h) = handle {
        if let Ok(mut f) = h.lock() {
            let _ = f.write_all(line.as_bytes());
            let _ = f.flush();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_handle = setup_log_file();

    log(&log_handle, "[setup] Orthrus starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup({
            let log_handle = log_handle.clone();
            move |app| {
                // --- macOS: set window background color ---
                #[cfg(target_os = "macos")]
                {
                    use objc2_app_kit::{NSColor, NSWindow};

                    match app.get_webview_window("main") {
                        Some(window) => match window.ns_window() {
                            Ok(raw) => {
                                let ns_window: &NSWindow =
                                    unsafe { &*(raw as *const NSWindow) };
                                let bg_color = NSColor::colorWithSRGBRed_green_blue_alpha(
                                    22.0 / 255.0,
                                    27.0 / 255.0,
                                    34.0 / 255.0,
                                    1.0,
                                );
                                ns_window.setBackgroundColor(Some(&bg_color));
                                log(&log_handle, "[setup] window background color set");
                            }
                            Err(e) => log(&log_handle, &format!("[setup] failed to get ns_window: {e}")),
                        },
                        None => log(&log_handle, "[setup] main window not yet available"),
                    }
                }

                // --- Spawn backend sidecar ---
                log(&log_handle, "[setup] spawning sidecar 'orthrus-backend'...");

                let sidecar_result = app
                    .shell()
                    .sidecar("orthrus-backend")
                    .map(|cmd| cmd.args(["--relay-port", "29000", "--proxy-port", "28080"]));

                match sidecar_result {
                    Ok(sidecar) => match sidecar.spawn() {
                        Ok((mut rx, child)) => {
                            log(&log_handle, &format!("[setup] sidecar spawned (pid={})", child.pid()));
                            app.manage(BackendProcess(std::sync::Mutex::new(Some(child))));

                            // Log sidecar stdout/stderr in background
                            let bg_log = log_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                use tauri_plugin_shell::process::CommandEvent;

                                while let Some(event) = rx.recv().await {
                                    match event {
                                        CommandEvent::Stdout(line) => {
                                            let msg = String::from_utf8_lossy(&line);
                                            log(&bg_log, &format!("[backend:out] {}", msg.trim()));
                                        }
                                        CommandEvent::Stderr(line) => {
                                            let msg = String::from_utf8_lossy(&line);
                                            log(&bg_log, &format!("[backend:err] {}", msg.trim()));
                                        }
                                        CommandEvent::Terminated(payload) => {
                                            log(
                                                &bg_log,
                                                &format!(
                                                    "[backend] terminated: code={:?} signal={:?}",
                                                    payload.code, payload.signal
                                                ),
                                            );
                                            break;
                                        }
                                        CommandEvent::Error(err) => {
                                            log(&bg_log, &format!("[backend] error: {}", err));
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                            });
                        }
                        Err(e) => log(&log_handle, &format!("[setup] failed to spawn sidecar: {e}")),
                    },
                    Err(e) => log(&log_handle, &format!("[setup] failed to create sidecar command: {e}")),
                }

                Ok(())
            }
        })
        .on_window_event({
            let log_handle = log_handle.clone();
            move |window, event| {
                // Kill backend when window is destroyed (app closing)
                let tauri::WindowEvent::Destroyed = event else { return };
                let Some(state) = window.try_state::<BackendProcess>() else { return };
                let Ok(mut guard) = state.0.lock() else { return };
                let Some(child) = guard.take() else { return };

                let _ = child.kill();
                log(&log_handle, "[backend] killed sidecar process");
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Orthrus");
}

/// Wrapper to store the sidecar child process handle in Tauri state.
struct BackendProcess(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);
