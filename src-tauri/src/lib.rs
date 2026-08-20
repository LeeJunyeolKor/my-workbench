pub mod commands;
pub mod domain;
pub mod process;
pub mod services;

use commands::agent::*;
use commands::local_data::*;
use services::agent_service::AgentServiceState;
use services::local_data_service::LocalDataService;
use services::path_policy::AllowedWorkspaceRoots;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let local_data = LocalDataService::from_env();
    tauri::Builder::default()
        .manage(AgentServiceState::default())
        .manage(AllowedWorkspaceRoots::from_env())
        .manage(local_data)
        .invoke_handler(tauri::generate_handler![
            select_workspace,
            start_agent_task,
            cancel_agent_task,
            get_changed_files,
            get_diff,
            load_tasks,
            save_tasks,
            list_plans,
            load_plan,
            save_plan_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
