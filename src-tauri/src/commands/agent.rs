use crate::domain::task::{Task, Workspace};
use crate::services::agent_service::{AgentService, AgentServiceState};
use crate::services::git_service::{ChangedFile, GitService};
use crate::services::workspace_service::WorkspaceService;

#[tauri::command]
pub fn select_workspace(path: String) -> Result<Workspace, String> {
    Ok(WorkspaceService::select_workspace(path))
}

#[tauri::command]
pub async fn start_agent_task<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    state: tauri::State<'_, AgentServiceState>,
    workspace_path: String,
    prompt: String,
    agent_type: String,
    execution_mode: Option<String>,
) -> Result<Task, String> {
    AgentService::start_task(
        app_handle,
        &state,
        workspace_path,
        prompt,
        agent_type,
        execution_mode,
    )
    .await
}

#[tauri::command]
pub async fn cancel_agent_task(
    state: tauri::State<'_, AgentServiceState>,
    task_id: String,
) -> Result<(), String> {
    AgentService::cancel_task(&state, &task_id).await
}

#[tauri::command]
pub async fn get_changed_files(worktree_path: String) -> Result<Vec<ChangedFile>, String> {
    GitService::get_changed_files(&worktree_path).await
}

#[tauri::command]
pub async fn get_diff(worktree_path: String, file_path: String) -> Result<String, String> {
    GitService::get_diff(&worktree_path, &file_path).await
}
