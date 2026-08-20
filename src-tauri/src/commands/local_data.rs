use crate::services::local_data_service::{LocalDataService, PlanContent, PlanList, TasksContent};

#[tauri::command]
pub async fn load_tasks(
    state: tauri::State<'_, Result<LocalDataService, String>>,
) -> Result<TasksContent, String> {
    let service = configured_service(&state)?;
    run_io(move || service.load_tasks()).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_tasks(
    state: tauri::State<'_, Result<LocalDataService, String>>,
    content: String,
    expected_content: Option<String>,
) -> Result<(), String> {
    let service = configured_service(&state)?;
    run_io(move || service.save_tasks(&content, expected_content.as_deref())).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_plans(
    state: tauri::State<'_, Result<LocalDataService, String>>,
) -> Result<PlanList, String> {
    let service = configured_service(&state)?;
    run_io(move || service.list_plans()).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn load_plan(
    state: tauri::State<'_, Result<LocalDataService, String>>,
    task_id: String,
) -> Result<PlanContent, String> {
    let service = configured_service(&state)?;
    run_io(move || service.load_plan(&task_id)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_plan_file(
    state: tauri::State<'_, Result<LocalDataService, String>>,
    task_id: String,
    filename: String,
    content: String,
    expected_content: String,
) -> Result<(), String> {
    let service = configured_service(&state)?;
    run_io(move || service.save_plan_file(&task_id, &filename, &content, &expected_content)).await
}

fn configured_service(
    state: &tauri::State<'_, Result<LocalDataService, String>>,
) -> Result<LocalDataService, String> {
    state.inner().clone()
}

async fn run_io<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| format!("로컬 데이터 작업을 완료하지 못했습니다: {error}"))?
}
