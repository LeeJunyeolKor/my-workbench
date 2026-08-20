pub mod commands;
pub mod domain;
pub mod process;
pub mod services;

use commands::agent::*;
use services::agent_service::AgentServiceState;
use services::path_policy::AllowedWorkspaceRoots;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AgentServiceState::default())
        .manage(AllowedWorkspaceRoots::from_env())
        .invoke_handler(tauri::generate_handler![
            select_workspace,
            start_agent_task,
            cancel_agent_task,
            get_changed_files,
            get_diff
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
