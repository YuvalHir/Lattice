use std::sync::Arc;
use tokio::sync::Mutex;
use crate::state::SessionRegistry;

pub mod state;
pub mod process;
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize the global session registry
    // This Arc<Mutex<>> is the "source of truth" for all active project tabs.
    let state = Arc::new(Mutex::new(SessionRegistry::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state) // Inject the state into the Tauri application
        .invoke_handler(tauri::generate_handler![
            commands::spawn_process,
            commands::write_to_stdin,
            commands::kill_process,
            commands::resize_terminal,
            commands::get_git_info,
            commands::git_status,
            commands::git_add,
            commands::git_unstage,
            commands::git_commit,
            commands::git_push,
            commands::git_init,
            commands::git_add_all,
            commands::get_git_log,
            commands::get_memory_usage,
        ])


        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
