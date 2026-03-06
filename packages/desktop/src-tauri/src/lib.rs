use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
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
                        }
                        Err(e) => eprintln!("[setup] failed to get ns_window: {e}"),
                    },
                    None => eprintln!("[setup] main window not yet available"),
                }
            }

            // --- Spawn backend sidecar ---
            let sidecar_result = app
                .shell()
                .sidecar("../binaries/orthrus-backend")
                .map(|cmd| cmd.args(["--relay-port", "29000", "--proxy-port", "28080"]));

            match sidecar_result {
                Ok(sidecar) => match sidecar.spawn() {
                    Ok((mut rx, child)) => {
                        app.manage(BackendProcess(std::sync::Mutex::new(Some(child))));

                        // Log sidecar stdout/stderr in background
                        tauri::async_runtime::spawn(async move {
                            use tauri_plugin_shell::process::CommandEvent;

                            while let Some(event) = rx.recv().await {
                                match event {
                                    CommandEvent::Stdout(line) => {
                                        let msg = String::from_utf8_lossy(&line);
                                        eprintln!("[backend] {}", msg);
                                    }
                                    CommandEvent::Stderr(line) => {
                                        let msg = String::from_utf8_lossy(&line);
                                        eprintln!("[backend] {}", msg);
                                    }
                                    CommandEvent::Terminated(payload) => {
                                        eprintln!(
                                            "[backend] terminated: code={:?} signal={:?}",
                                            payload.code, payload.signal
                                        );
                                        break;
                                    }
                                    CommandEvent::Error(err) => {
                                        eprintln!("[backend] error: {}", err);
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        });
                    }
                    Err(e) => eprintln!("[setup] failed to spawn sidecar: {e}"),
                },
                Err(e) => eprintln!("[setup] failed to create sidecar command: {e}"),
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill backend when window is destroyed (app closing)
            let tauri::WindowEvent::Destroyed = event else { return };
            let Some(state) = window.try_state::<BackendProcess>() else { return };
            let Ok(mut guard) = state.0.lock() else { return };
            let Some(child) = guard.take() else { return };

            let _ = child.kill();
            eprintln!("[backend] killed sidecar process");
        })
        .run(tauri::generate_context!())
        .expect("error while running Orthrus");
}

/// Wrapper to store the sidecar child process handle in Tauri state.
struct BackendProcess(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);
