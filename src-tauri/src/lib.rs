use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

/// Port that the bundled Maestro backend binds to on localhost.
const BACKEND_PORT: u16 = 5180;
static STARTED: AtomicBool = AtomicBool::new(false);

/// Absolute path to a Tauri `externalBin` sidecar at runtime. Tauri places
/// externalBin binaries next to the app executable with the target-triple
/// suffix stripped (e.g. `maestro-backend.exe`).
fn sidecar_path(app: &tauri::App) -> Result<PathBuf, String> {
    let bin = app
        .path()
        .resolve("maestro-backend", tauri::path::BaseDirectory::Resource)
        .or_else(|_| {
            // On some targets the sidecar lands next to the main executable.
            app.path()
                .resolve("maestro-backend", tauri::path::BaseDirectory::Executable)
        })
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    let with_ext = bin.with_extension("exe");
    #[cfg(not(target_os = "windows"))]
    let with_ext = bin.clone();
    Ok(with_ext)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            boot_backend(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Maestro");
}

/// Spawn the Node sidecar backend, then point the main window at it once it's
/// ready to answer HTTP.
fn boot_backend(app: &tauri::App) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let resource_dir = app.path().resource_dir().expect("resource dir present");
    let server_js = resource_dir.join("output/server/index.mjs");
    if !server_js.exists() {
        eprintln!("[maestro] backend entrypoint missing: {server_js:?}");
        return;
    }

    let sidecar = match sidecar_path(app) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[maestro] could not resolve sidecar: {e}");
            return;
        }
    };

    let handle = app.handle().clone();
    let backend_url = format!("http://127.0.0.1:{BACKEND_PORT}");

    std::thread::spawn(move || {
        let mut cmd = Command::new(&sidecar);
        cmd.arg(&server_js)
            .env("PORT", BACKEND_PORT.to_string())
            .env("HOST", "127.0.0.1")
            .env("NODE_ENV", "production")
            .env("MAESTRO_DESKTOP", "1");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        match cmd.spawn() {
            Ok(child) => {
                // Keep the child handle alive for the app's lifetime.
                std::mem::forget(child);
                if wait_until_ready(&backend_url, 300, 200) {
                    if let Some(win) = handle.get_webview_window("main") {
                        let _ = win.navigate(backend_url.parse().expect("valid url"));
                    }
                } else {
                    eprintln!("[maestro] backend did not become ready in time");
                }
            }
            Err(e) => eprintln!("[maestro] failed to spawn backend: {e}"),
        }
    });
}

/// Poll `url` until it returns an HTTP 2xx, up to `attempts * delay_ms`.
fn wait_until_ready(url: &str, attempts: usize, delay_ms: u64) -> bool {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new());

    for _ in 0..attempts {
        match client.get(url).send() {
            Ok(resp) => {
                if resp.status().is_success() {
                    return true;
                }
            }
            Err(_) => { /* keep polling */ }
        }
        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
    }
    false
}
