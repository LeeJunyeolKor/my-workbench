use crate::domain::task::{Task, Workspace};
use crate::services::agent_service::{AgentService, AgentServiceState};
use crate::services::git_service::{ChangedFile, GitService};
use crate::services::path_policy::{validate_relative_file_path, AllowedWorkspaceRoots};
use crate::services::workspace_service::WorkspaceService;

#[tauri::command]
pub async fn select_workspace(
    path_policy: tauri::State<'_, AllowedWorkspaceRoots>,
    path: String,
) -> Result<Workspace, String> {
    let path = path_policy.resolve_allowed_directory(&path)?;
    let path = GitService::resolve_git_workspace(&path).await?;
    Ok(WorkspaceService::select_workspace(path))
}

#[tauri::command]
pub async fn start_agent_task<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    state: tauri::State<'_, AgentServiceState>,
    path_policy: tauri::State<'_, AllowedWorkspaceRoots>,
    workspace_path: String,
    prompt: String,
    agent_type: String,
    execution_mode: Option<String>,
) -> Result<Task, String> {
    let workspace_path = path_policy.resolve_allowed_directory(&workspace_path)?;
    let workspace_path = GitService::resolve_git_workspace(&workspace_path).await?;
    let workspace_path = utf8_path(&workspace_path)?.to_string();
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
pub async fn get_changed_files(
    path_policy: tauri::State<'_, AllowedWorkspaceRoots>,
    worktree_path: String,
) -> Result<Vec<ChangedFile>, String> {
    let worktree_path = path_policy.resolve_allowed_directory(&worktree_path)?;
    GitService::get_changed_files(utf8_path(&worktree_path)?).await
}

#[tauri::command]
pub async fn get_diff(
    path_policy: tauri::State<'_, AllowedWorkspaceRoots>,
    worktree_path: String,
    file_path: String,
) -> Result<String, String> {
    let worktree_path = path_policy.resolve_allowed_directory(&worktree_path)?;
    let file_path = validate_relative_file_path(&file_path)?;
    GitService::get_diff(utf8_path(&worktree_path)?, utf8_path(&file_path)?).await
}

fn utf8_path(path: &std::path::Path) -> Result<&str, String> {
    path.to_str()
        .ok_or_else(|| "작업공간 경로는 UTF-8 문자열이어야 합니다.".to_string())
}
