fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "select_workspace",
            "start_agent_task",
            "cancel_agent_task",
            "get_changed_files",
            "get_diff",
            "load_tasks",
            "save_tasks",
            "list_plans",
            "load_plan",
            "save_plan_file",
        ]),
    ))
    .expect("failed to run Tauri build script");
}
