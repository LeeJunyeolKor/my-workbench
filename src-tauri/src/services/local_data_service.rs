use serde::Serialize;
use serde_json::Value;
use std::ffi::{OsStr, OsString};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
#[cfg(test)]
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

const DATA_DIR_ENV: &str = "MY_WORKBENCH_DATA";
const PLANS_DIR_ENV: &str = "WORKBENCH_PLANS_DIR";
const TASKS_FILENAME: &str = "TASKS.md";
const PLAN_SETTINGS_FILENAME: &str = "plan_settings.json";
const MAX_FILE_BYTES: usize = 1024 * 1024;
const MAX_PLAN_FILES: usize = 256;
const MAX_PLAN_ENTRIES: usize = 2048;
const MAX_PLAN_BYTES: usize = 8 * 1024 * 1024;
const CONFLICT_MESSAGE: &str =
    "파일이 외부에서 변경되었습니다. 최신 내용을 다시 불러온 뒤 저장해 주세요.";
#[cfg(test)]
static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone)]
pub struct LocalDataService {
    data_dir: PathBuf,
    plans_dir: PathBuf,
    write_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TasksContent {
    pub content: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSummaryContent {
    pub task_id: String,
    pub content: String,
    pub modified_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanList {
    pub plans_dir: String,
    pub plans: Vec<PlanSummaryContent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanFileContent {
    pub filename: String,
    pub content: String,
    pub modified_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanContent {
    pub plans_dir: String,
    pub task_id: String,
    pub files: Vec<PlanFileContent>,
}

impl LocalDataService {
    pub fn from_env() -> Result<Self, String> {
        let home = home_directory().ok_or_else(|| {
            "홈 디렉터리를 확인할 수 없어 로컬 데이터 경로를 설정하지 못했습니다.".to_string()
        })?;
        Self::from_config(
            std::env::var_os(DATA_DIR_ENV),
            std::env::var_os(PLANS_DIR_ENV),
            &home,
        )
    }

    fn from_config(
        data_dir_value: Option<OsString>,
        plans_dir_value: Option<OsString>,
        home: &Path,
    ) -> Result<Self, String> {
        if home.as_os_str().is_empty() || !home.is_absolute() {
            return Err("홈 디렉터리는 비어 있지 않은 절대 경로여야 합니다.".to_string());
        }
        let data_dir = match non_empty_path(data_dir_value) {
            Some(path) => resolve_absolute_path(&path, home, DATA_DIR_ENV)?,
            None => home.join(".my-workbench"),
        };

        let saved_plans_dir = read_saved_plans_dir(&data_dir, home)?;
        let plans_dir = match saved_plans_dir {
            Some(path) => path,
            None => match non_empty_path(plans_dir_value) {
                Some(path) => resolve_absolute_path(&path, home, PLANS_DIR_ENV)?,
                None => data_dir.join("plans"),
            },
        };

        if !data_dir.is_absolute() || !plans_dir.is_absolute() {
            return Err("로컬 데이터 경로는 절대 경로여야 합니다.".to_string());
        }
        if data_dir.to_str().is_none() || plans_dir.to_str().is_none() {
            return Err("로컬 데이터 경로는 UTF-8 문자열이어야 합니다.".to_string());
        }

        Ok(Self {
            data_dir,
            plans_dir,
            write_lock: Arc::new(Mutex::new(())),
        })
    }

    pub fn load_tasks(&self) -> Result<TasksContent, String> {
        let Some(data_root) = existing_regular_directory(&self.data_dir, false)? else {
            return Ok(TasksContent { content: None });
        };
        let path = self.data_dir.join(TASKS_FILENAME);
        let Some(path) = existing_regular_file(&path, &data_root, false)? else {
            return Ok(TasksContent { content: None });
        };

        Ok(TasksContent {
            content: Some(read_utf8_file(&path, MAX_FILE_BYTES)?),
        })
    }

    pub fn save_tasks(&self, content: &str, expected_content: Option<&str>) -> Result<(), String> {
        validate_content_size(content)?;
        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "로컬 데이터 저장 잠금을 사용할 수 없습니다.".to_string())?;
        create_data_directory(&self.data_dir)?;
        let data_root = existing_regular_directory(&self.data_dir, true)?
            .ok_or_else(|| "로컬 데이터 디렉터리를 만들지 못했습니다.".to_string())?;
        let target = self.data_dir.join(TASKS_FILENAME);

        match existing_regular_file(&target, &data_root, true) {
            Ok(_) => {}
            Err(error) => return Err(error),
        }
        write_atomic(&target, content.as_bytes(), expected_content, &data_root)
    }

    pub fn list_plans(&self) -> Result<PlanList, String> {
        let plans_dir = self.plans_dir_string();
        let Some(plans_root) = existing_regular_directory(&self.plans_dir, false)? else {
            return Ok(PlanList {
                plans_dir,
                plans: Vec::new(),
            });
        };

        let mut plans = Vec::new();
        let mut total_bytes = 0usize;
        let mut visited_entries = 0usize;
        for entry in read_dir_entries(&self.plans_dir)? {
            let entry =
                entry.map_err(|error| io_error("구현 계획 항목을 읽지 못했습니다", error))?;
            visited_entries += 1;
            if visited_entries > MAX_PLAN_ENTRIES {
                return Err(format!(
                    "구현 계획 디렉터리가 {MAX_PLAN_ENTRIES}개 항목 제한을 초과했습니다."
                ));
            }
            let file_type = entry
                .file_type()
                .map_err(|error| io_error("구현 계획 항목 형식을 확인하지 못했습니다", error))?;
            if file_type.is_symlink() || !file_type.is_dir() {
                continue;
            }

            let Some(task_id) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if !is_valid_task_id(&task_id) {
                continue;
            }

            let task_dir = entry.path();
            let task_root = fs::canonicalize(&task_dir)
                .map_err(|error| io_error("구현 계획 디렉터리를 확인하지 못했습니다", error))?;
            if !task_root.starts_with(&plans_root) {
                return Err("구현 계획 디렉터리가 계획 루트 밖을 가리킵니다.".to_string());
            }

            let plan_path = task_dir.join("plan.md");
            let Some(plan_path) = existing_regular_file(&plan_path, &task_root, false)? else {
                continue;
            };
            if plans.len() >= MAX_PLAN_FILES {
                return Err(format!(
                    "구현 계획 목록이 {MAX_PLAN_FILES}개 파일 제한을 초과했습니다."
                ));
            }

            let content = read_utf8_file(&plan_path, MAX_FILE_BYTES)?;
            total_bytes = total_bytes
                .checked_add(content.len())
                .ok_or_else(|| "구현 계획 전체 크기를 계산할 수 없습니다.".to_string())?;
            if total_bytes > MAX_PLAN_BYTES {
                return Err("구현 계획 목록이 8 MiB 제한을 초과했습니다.".to_string());
            }
            let modified_at_ms = modified_at_ms(&plan_path)?;
            plans.push(PlanSummaryContent {
                task_id,
                content,
                modified_at_ms,
            });
        }

        plans.sort_by(|left, right| {
            right
                .modified_at_ms
                .cmp(&left.modified_at_ms)
                .then_with(|| left.task_id.cmp(&right.task_id))
        });
        Ok(PlanList { plans_dir, plans })
    }

    pub fn load_plan(&self, task_id: &str) -> Result<Option<PlanContent>, String> {
        validate_task_id(task_id)?;
        let plans_dir = self.plans_dir_string();
        let Some(plans_root) = existing_regular_directory(&self.plans_dir, false)? else {
            return Ok(None);
        };

        let task_dir = self.plans_dir.join(task_id);
        let Some(task_root) = existing_regular_directory(&task_dir, false)? else {
            return Ok(None);
        };
        if !task_root.starts_with(&plans_root) {
            return Err("구현 계획 디렉터리가 계획 루트 밖을 가리킵니다.".to_string());
        }

        let files = read_plan_files(&task_dir, &task_root)?;
        if files.is_empty() {
            return Ok(None);
        }

        Ok(Some(PlanContent {
            plans_dir,
            task_id: task_id.to_string(),
            files,
        }))
    }

    pub fn save_plan_file(
        &self,
        task_id: &str,
        filename: &str,
        content: &str,
        expected_content: &str,
    ) -> Result<(), String> {
        validate_task_id(task_id)?;
        validate_content_size(content)?;
        let _guard = self
            .write_lock
            .lock()
            .map_err(|_| "로컬 데이터 저장 잠금을 사용할 수 없습니다.".to_string())?;
        let relative_path = validate_markdown_filename(filename)?;
        let plans_root = existing_regular_directory(&self.plans_dir, true)?
            .ok_or_else(|| "구현 계획 루트가 존재하지 않습니다.".to_string())?;
        let task_dir = self.plans_dir.join(task_id);
        let task_root = existing_regular_directory(&task_dir, true)?
            .ok_or_else(|| "구현 계획 디렉터리가 존재하지 않습니다.".to_string())?;
        if !task_root.starts_with(&plans_root) {
            return Err("구현 계획 디렉터리가 계획 루트 밖을 가리킵니다.".to_string());
        }

        ensure_regular_parent_directories(&task_dir, &relative_path, &task_root)?;
        let target = task_dir.join(relative_path);
        let target = existing_regular_file(&target, &task_root, true)?
            .ok_or_else(|| "기존 마크다운 파일만 편집할 수 있습니다.".to_string())?;

        let plan_files = collect_plan_files(&task_dir, &task_root)?;
        let mut total_bytes = 0usize;
        for path in &plan_files {
            let file_size = fs::metadata(path)
                .map_err(|error| io_error("구현 계획 파일 크기를 확인하지 못했습니다", error))?
                .len();
            if file_size > MAX_FILE_BYTES as u64 {
                return Err("구현 계획 파일이 1 MiB 제한을 초과했습니다.".to_string());
            }
            total_bytes = total_bytes
                .checked_add(file_size as usize)
                .ok_or_else(|| "구현 계획 전체 크기를 계산할 수 없습니다.".to_string())?;
        }
        let current_size = fs::metadata(&target)
            .map_err(|error| io_error("구현 계획 파일 크기를 확인하지 못했습니다", error))?
            .len() as usize;
        let next_total = total_bytes
            .checked_sub(current_size)
            .and_then(|size| size.checked_add(content.len()))
            .ok_or_else(|| "구현 계획 전체 크기를 계산할 수 없습니다.".to_string())?;
        if next_total > MAX_PLAN_BYTES {
            return Err("구현 계획이 8 MiB 제한을 초과했습니다.".to_string());
        }

        write_atomic(
            &target,
            content.as_bytes(),
            Some(expected_content),
            &task_root,
        )
    }

    fn plans_dir_string(&self) -> String {
        self.plans_dir
            .to_str()
            .expect("validated UTF-8 plans directory")
            .to_string()
    }
}

fn read_plan_files(task_dir: &Path, task_root: &Path) -> Result<Vec<PlanFileContent>, String> {
    let paths = collect_plan_files(task_dir, task_root)?;
    let mut total_bytes = 0usize;
    let mut files = Vec::with_capacity(paths.len());

    for path in paths {
        let content = read_utf8_file(&path, MAX_FILE_BYTES)?;
        total_bytes = total_bytes
            .checked_add(content.len())
            .ok_or_else(|| "구현 계획 전체 크기를 계산할 수 없습니다.".to_string())?;
        if total_bytes > MAX_PLAN_BYTES {
            return Err("구현 계획이 8 MiB 제한을 초과했습니다.".to_string());
        }
        let relative_path = path
            .strip_prefix(task_root)
            .map_err(|_| "구현 계획 파일이 계획 디렉터리 밖을 가리킵니다.".to_string())?;
        let filename = relative_markdown_filename(relative_path)?;
        files.push(PlanFileContent {
            filename,
            content,
            modified_at_ms: modified_at_ms(&path)?,
        });
    }

    files.sort_by(|left, right| left.filename.cmp(&right.filename));
    Ok(files)
}

fn collect_plan_files(task_dir: &Path, task_root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut directories = vec![task_dir.to_path_buf()];
    let mut files = Vec::new();
    let mut visited_entries = 0usize;

    while let Some(directory) = directories.pop() {
        for entry in read_dir_entries(&directory)? {
            let entry =
                entry.map_err(|error| io_error("구현 계획 항목을 읽지 못했습니다", error))?;
            visited_entries += 1;
            if visited_entries > MAX_PLAN_ENTRIES {
                return Err(format!(
                    "구현 계획이 {MAX_PLAN_ENTRIES}개 항목 제한을 초과했습니다."
                ));
            }
            let file_type = entry
                .file_type()
                .map_err(|error| io_error("구현 계획 항목 형식을 확인하지 못했습니다", error))?;
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                if !entry.file_name().to_string_lossy().starts_with('.') {
                    directories.push(entry.path());
                }
                continue;
            }
            if !file_type.is_file() || entry.path().extension() != Some(OsStr::new("md")) {
                continue;
            }
            if files.len() >= MAX_PLAN_FILES {
                return Err(format!(
                    "구현 계획이 {MAX_PLAN_FILES}개 파일 제한을 초과했습니다."
                ));
            }

            let canonical = fs::canonicalize(entry.path())
                .map_err(|error| io_error("구현 계획 파일을 확인하지 못했습니다", error))?;
            if !canonical.starts_with(task_root) {
                return Err("구현 계획 파일이 계획 디렉터리 밖을 가리킵니다.".to_string());
            }
            files.push(canonical);
        }
    }

    Ok(files)
}

fn read_dir_entries(path: &Path) -> Result<fs::ReadDir, String> {
    fs::read_dir(path).map_err(|error| io_error("디렉터리를 읽지 못했습니다", error))
}

fn existing_regular_directory(
    path: &Path,
    reject_symlink: bool,
) -> Result<Option<PathBuf>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(io_error("디렉터리를 확인하지 못했습니다", error)),
    };
    if metadata.file_type().is_symlink() {
        return if reject_symlink {
            Err("심볼릭 링크 디렉터리는 사용할 수 없습니다.".to_string())
        } else {
            Ok(None)
        };
    }
    if !metadata.is_dir() {
        return Err("설정된 경로가 디렉터리가 아닙니다.".to_string());
    }

    fs::canonicalize(path)
        .map(Some)
        .map_err(|error| io_error("디렉터리 경로를 확인하지 못했습니다", error))
}

fn existing_regular_file(
    path: &Path,
    allowed_root: &Path,
    reject_symlink: bool,
) -> Result<Option<PathBuf>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(io_error("파일을 확인하지 못했습니다", error)),
    };
    if metadata.file_type().is_symlink() {
        return if reject_symlink {
            Err("심볼릭 링크 파일은 사용할 수 없습니다.".to_string())
        } else {
            Ok(None)
        };
    }
    if !metadata.is_file() {
        return Err("일반 파일만 사용할 수 있습니다.".to_string());
    }

    let canonical = fs::canonicalize(path)
        .map_err(|error| io_error("파일 경로를 확인하지 못했습니다", error))?;
    if !canonical.starts_with(allowed_root) {
        return Err("파일이 허용된 데이터 디렉터리 밖을 가리킵니다.".to_string());
    }
    Ok(Some(canonical))
}

fn ensure_regular_parent_directories(
    task_dir: &Path,
    relative_path: &Path,
    task_root: &Path,
) -> Result<(), String> {
    let mut current = task_dir.to_path_buf();
    let Some(parent) = relative_path.parent() else {
        return Ok(());
    };

    for component in parent.components() {
        let Component::Normal(part) = component else {
            continue;
        };
        current.push(part);
        let metadata = fs::symlink_metadata(&current)
            .map_err(|error| io_error("구현 계획 상위 디렉터리를 확인하지 못했습니다", error))?;
        if metadata.file_type().is_symlink() {
            return Err("심볼릭 링크 디렉터리를 통해 파일을 편집할 수 없습니다.".to_string());
        }
        if !metadata.is_dir() {
            return Err("구현 계획 파일의 상위 경로가 디렉터리가 아닙니다.".to_string());
        }
        let canonical = fs::canonicalize(&current).map_err(|error| {
            io_error("구현 계획 상위 디렉터리 경로를 확인하지 못했습니다", error)
        })?;
        if !canonical.starts_with(task_root) {
            return Err("구현 계획 파일이 계획 디렉터리 밖을 가리킵니다.".to_string());
        }
    }
    Ok(())
}

fn create_data_directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err("심볼릭 링크 데이터 디렉터리는 사용할 수 없습니다.".to_string())
        }
        Ok(metadata) if !metadata.is_dir() => {
            return Err("로컬 데이터 경로가 디렉터리가 아닙니다.".to_string())
        }
        Ok(_) => return Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(io_error(
                "로컬 데이터 디렉터리를 확인하지 못했습니다",
                error,
            ))
        }
    }

    fs::create_dir_all(path)
        .map_err(|error| io_error("로컬 데이터 디렉터리를 만들지 못했습니다", error))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| io_error("로컬 데이터 디렉터리 권한을 설정하지 못했습니다", error))?;
    }
    Ok(())
}

fn read_utf8_file(path: &Path, limit: usize) -> Result<String, String> {
    let file = File::open(path).map_err(|error| io_error("파일을 열지 못했습니다", error))?;
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| io_error("파일을 읽지 못했습니다", error))?;
    if bytes.len() > limit {
        return Err("파일이 1 MiB 제한을 초과했습니다.".to_string());
    }
    String::from_utf8(bytes).map_err(|_| "파일은 UTF-8 텍스트여야 합니다.".to_string())
}

fn write_atomic(
    target: &Path,
    content: &[u8],
    expected_content: Option<&str>,
    allowed_root: &Path,
) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "파일의 상위 디렉터리를 확인할 수 없습니다.".to_string())?;
    let file_name = target
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "파일명은 UTF-8 문자열이어야 합니다.".to_string())?;

    let mut temporary = tempfile::Builder::new()
        .prefix(&format!(".{file_name}.tmp-"))
        .tempfile_in(parent)
        .map_err(|error| io_error("임시 파일을 만들지 못했습니다", error))?;
    temporary
        .write_all(content)
        .map_err(|error| io_error("임시 파일에 쓰지 못했습니다", error))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| io_error("임시 파일을 동기화하지 못했습니다", error))?;

    let current_path = verify_expected_content(target, expected_content, allowed_root)?;
    if let Some(current_path) = current_path {
        let permissions = fs::metadata(current_path)
            .map_err(|error| io_error("기존 파일 권한을 확인하지 못했습니다", error))?
            .permissions();
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(|error| io_error("기존 파일 권한을 보존하지 못했습니다", error))?;
    } else {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            temporary
                .as_file()
                .set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|error| io_error("새 파일 권한을 설정하지 못했습니다", error))?;
        }
    }

    temporary
        .persist(target)
        .map_err(|error| io_error("파일을 원자적으로 교체하지 못했습니다", error.error))?;
    #[cfg(unix)]
    if let Ok(parent_directory) = File::open(parent) {
        let _ = parent_directory.sync_all();
    }
    Ok(())
}

fn verify_expected_content(
    target: &Path,
    expected_content: Option<&str>,
    allowed_root: &Path,
) -> Result<Option<PathBuf>, String> {
    let current_path = existing_regular_file(target, allowed_root, true)?;
    match (&current_path, expected_content) {
        (None, None) => Ok(None),
        (Some(path), Some(expected))
            if read_utf8_file(path, MAX_FILE_BYTES)?.as_str() == expected =>
        {
            Ok(current_path)
        }
        _ => Err(CONFLICT_MESSAGE.to_string()),
    }
}

fn relative_markdown_filename(path: &Path) -> Result<String, String> {
    path.components()
        .map(|component| match component {
            Component::Normal(part) => part
                .to_str()
                .map(str::to_owned)
                .ok_or_else(|| "구현 계획 파일 경로는 UTF-8 문자열이어야 합니다.".to_string()),
            _ => Err("구현 계획 파일 경로가 올바르지 않습니다.".to_string()),
        })
        .collect::<Result<Vec<_>, _>>()
        .map(|components| components.join("/"))
}

fn modified_at_ms(path: &Path) -> Result<u64, String> {
    let modified = fs::metadata(path)
        .map_err(|error| io_error("파일 수정 시각을 확인하지 못했습니다", error))?
        .modified()
        .map_err(|error| io_error("파일 수정 시각을 읽지 못했습니다", error))?;
    modified
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| "파일 수정 시각이 Unix epoch보다 이전입니다.".to_string())
}

fn validate_content_size(content: &str) -> Result<(), String> {
    if content.len() > MAX_FILE_BYTES {
        Err("파일이 1 MiB 제한을 초과했습니다.".to_string())
    } else {
        Ok(())
    }
}

fn validate_task_id(task_id: &str) -> Result<(), String> {
    if is_valid_task_id(task_id) {
        Ok(())
    } else {
        Err(
            "작업 ID는 영숫자를 하나 이상 포함하고 영숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다."
                .to_string(),
        )
    }
}

fn is_valid_task_id(task_id: &str) -> bool {
    !task_id.is_empty()
        && task_id.bytes().any(|byte| byte.is_ascii_alphanumeric())
        && task_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn validate_markdown_filename(filename: &str) -> Result<PathBuf, String> {
    let path = Path::new(filename);
    let mut normalized = PathBuf::new();
    if path.is_absolute() {
        return Err("구현 계획 파일명은 상대 경로여야 합니다.".to_string());
    }
    for component in path.components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("구현 계획 파일명에 상위 경로를 사용할 수 없습니다.".to_string())
            }
        }
    }
    if normalized.as_os_str().is_empty() || normalized.extension() != Some(OsStr::new("md")) {
        return Err("마크다운 파일(.md)만 편집할 수 있습니다.".to_string());
    }
    Ok(normalized)
}

fn non_empty_path(value: Option<OsString>) -> Option<PathBuf> {
    value.filter(|value| !value.is_empty()).map(PathBuf::from)
}

fn resolve_absolute_path(path: &Path, home: &Path, source: &str) -> Result<PathBuf, String> {
    let expanded = expand_home(path, home);
    if !expanded.is_absolute() {
        return Err(format!("{source}는 절대 경로 또는 ~/로 시작해야 합니다."));
    }
    Ok(expanded)
}

fn expand_home(path: &Path, home: &Path) -> PathBuf {
    match path.strip_prefix("~") {
        Ok(remainder) => home.join(remainder),
        Err(_) => path.to_path_buf(),
    }
}

fn read_saved_plans_dir(data_dir: &Path, home: &Path) -> Result<Option<PathBuf>, String> {
    let settings_path = data_dir.join(PLAN_SETTINGS_FILENAME);
    let metadata = match fs::symlink_metadata(&settings_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(io_error("계획 경로 설정을 확인하지 못했습니다", error)),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Ok(None);
    }

    let content = read_utf8_file(&settings_path, MAX_FILE_BYTES)?;
    let Ok(settings) = serde_json::from_str::<Value>(&content) else {
        return Ok(None);
    };
    let Some(path) = settings
        .get("plansDir")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|path| !path.is_empty())
    else {
        return Ok(None);
    };

    Ok(resolve_absolute_path(Path::new(path), home, "저장된 plansDir").ok())
}

fn home_directory() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty() && path.is_absolute())
}

fn io_error(context: &str, error: std::io::Error) -> String {
    format!("{context}: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_saved_then_environment_then_default_plan_paths() {
        let root = test_root("path-priority");
        let home = root.join("home");
        let data = root.join("data");
        let env_plans = root.join("env-plans");
        let saved_plans = root.join("saved-plans");
        fs::create_dir_all(&data).unwrap();
        fs::write(
            data.join(PLAN_SETTINGS_FILENAME),
            format!(r#"{{"plansDir":"{}"}}"#, saved_plans.display()),
        )
        .unwrap();

        let service = LocalDataService::from_config(
            Some(data.clone().into_os_string()),
            Some(env_plans.clone().into_os_string()),
            &home,
        )
        .unwrap();
        assert_eq!(service.data_dir, data);
        assert_eq!(service.plans_dir, saved_plans);

        fs::remove_file(service.data_dir.join(PLAN_SETTINGS_FILENAME)).unwrap();
        let service = LocalDataService::from_config(
            Some(service.data_dir.clone().into_os_string()),
            Some(env_plans.clone().into_os_string()),
            &home,
        )
        .unwrap();
        assert_eq!(service.plans_dir, env_plans);

        let service = LocalDataService::from_config(None, None, &home).unwrap();
        assert_eq!(service.data_dir, home.join(".my-workbench"));
        assert_eq!(service.plans_dir, home.join(".my-workbench/plans"));

        remove_test_root(root);
    }

    #[test]
    fn rejects_a_relative_or_empty_home_directory() {
        assert!(LocalDataService::from_config(None, None, Path::new("relative-home")).is_err());
        assert!(LocalDataService::from_config(None, None, Path::new("")).is_err());
    }

    #[test]
    fn missing_tasks_file_returns_null_content() {
        let root = test_root("missing-tasks");
        let service = service_in(&root);

        assert_eq!(
            service.load_tasks().unwrap(),
            TasksContent { content: None }
        );
        assert!(service.list_plans().unwrap().plans.is_empty());
        assert!(service.load_plan("TASK-1").unwrap().is_none());

        remove_test_root(root);
    }

    #[test]
    fn reports_a_non_directory_plan_root() {
        let root = test_root("invalid-plan-root");
        let service = service_in(&root);
        fs::write(&service.plans_dir, "not a directory").unwrap();

        assert!(service.list_plans().is_err());
        assert!(service.load_plan("TASK-1").is_err());

        remove_test_root(root);
    }

    #[test]
    fn saves_tasks_atomically_in_the_data_directory() {
        let root = test_root("save-tasks");
        let service = service_in(&root);

        service.save_tasks("# Tasks\n", None).unwrap();
        service
            .save_tasks("# Updated\n", Some("# Tasks\n"))
            .unwrap();

        assert_eq!(
            service.load_tasks().unwrap().content.as_deref(),
            Some("# Updated\n")
        );
        let entries = read_dir_entries(&service.data_dir)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].file_name(), TASKS_FILENAME);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(service.data_dir.join(TASKS_FILENAME))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
            assert_eq!(
                fs::metadata(&service.data_dir)
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
        }

        remove_test_root(root);
    }

    #[test]
    fn lists_plan_summaries_and_loads_recursive_markdown_files() {
        let root = test_root("list-load");
        let service = service_in(&root);
        let task_dir = service.plans_dir.join("TASK-123");
        fs::create_dir_all(task_dir.join("notes")).unwrap();
        fs::write(task_dir.join("plan.md"), "# Plan\n").unwrap();
        fs::write(task_dir.join("notes/detail.md"), "Details\n").unwrap();
        fs::write(task_dir.join("notes/ignored.txt"), "ignored\n").unwrap();

        let list = service.list_plans().unwrap();
        assert_eq!(list.plans_dir, service.plans_dir_string());
        assert_eq!(list.plans.len(), 1);
        assert_eq!(list.plans[0].task_id, "TASK-123");
        assert_eq!(list.plans[0].content, "# Plan\n");

        let plan = service.load_plan("TASK-123").unwrap().unwrap();
        assert_eq!(plan.task_id, "TASK-123");
        assert_eq!(plan.files.len(), 2);
        assert_eq!(plan.files[0].filename, "notes/detail.md");
        assert_eq!(plan.files[1].filename, "plan.md");

        remove_test_root(root);
    }

    #[test]
    fn rejects_traversal_non_markdown_and_missing_files() {
        let root = test_root("invalid-save");
        let service = service_in(&root);
        fs::create_dir_all(service.plans_dir.join("TASK-1")).unwrap();
        fs::write(service.plans_dir.join("TASK-1/plan.md"), "old").unwrap();

        assert!(service
            .save_plan_file("../escape", "plan.md", "new", "old")
            .is_err());
        assert!(service
            .save_plan_file("TASK-1", "../plan.md", "new", "old")
            .is_err());
        assert!(service
            .save_plan_file("TASK-1", "plan.txt", "new", "old")
            .is_err());
        assert!(service
            .save_plan_file("TASK-1", "missing.md", "new", "old")
            .is_err());

        remove_test_root(root);
    }

    #[test]
    fn rejects_oversized_content() {
        let root = test_root("oversized");
        let service = service_in(&root);
        fs::create_dir_all(service.plans_dir.join("TASK-1")).unwrap();
        fs::write(service.plans_dir.join("TASK-1/plan.md"), "old").unwrap();
        let oversized = "x".repeat(MAX_FILE_BYTES + 1);

        assert!(service.save_tasks(&oversized, None).is_err());
        assert!(service
            .save_plan_file("TASK-1", "plan.md", &oversized, "old")
            .is_err());

        remove_test_root(root);
    }

    #[test]
    fn rejects_plan_trees_with_too_many_entries() {
        let root = test_root("too-many-plan-entries");
        let service = service_in(&root);
        let task_dir = service.plans_dir.join("TASK-1");
        fs::create_dir_all(&task_dir).unwrap();
        fs::write(task_dir.join("plan.md"), "# Plan\n").unwrap();
        for index in 0..MAX_PLAN_ENTRIES {
            fs::write(task_dir.join(format!("ignored-{index}.txt")), "ignored").unwrap();
        }

        let error = service.load_plan("TASK-1").unwrap_err();
        assert!(error.contains("항목 제한"));

        remove_test_root(root);
    }

    #[test]
    fn edits_an_existing_regular_markdown_file() {
        let root = test_root("valid-edit");
        let service = service_in(&root);
        fs::create_dir_all(service.plans_dir.join("TASK-1")).unwrap();
        let plan_path = service.plans_dir.join("TASK-1/plan.md");
        fs::write(&plan_path, "old").unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&plan_path, fs::Permissions::from_mode(0o640)).unwrap();
        }

        service
            .save_plan_file("TASK-1", "plan.md", "updated", "old")
            .unwrap();

        assert_eq!(fs::read_to_string(&plan_path).unwrap(), "updated");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&plan_path).unwrap().permissions().mode() & 0o777,
                0o640
            );
        }

        remove_test_root(root);
    }

    #[test]
    fn rejects_task_and_plan_writes_after_external_changes() {
        let root = test_root("write-conflict");
        let service = service_in(&root);
        service.save_tasks("original", None).unwrap();
        fs::write(service.data_dir.join(TASKS_FILENAME), "external").unwrap();

        assert_eq!(
            service.save_tasks("edited", Some("original")).unwrap_err(),
            CONFLICT_MESSAGE
        );
        assert_eq!(
            fs::read_to_string(service.data_dir.join(TASKS_FILENAME)).unwrap(),
            "external"
        );

        let plan_path = service.plans_dir.join("TASK-1/plan.md");
        fs::create_dir_all(plan_path.parent().unwrap()).unwrap();
        fs::write(&plan_path, "original").unwrap();
        fs::write(&plan_path, "external").unwrap();
        assert_eq!(
            service
                .save_plan_file("TASK-1", "plan.md", "edited", "original")
                .unwrap_err(),
            CONFLICT_MESSAGE
        );
        assert_eq!(fs::read_to_string(plan_path).unwrap(), "external");

        remove_test_root(root);
    }

    #[cfg(unix)]
    #[test]
    fn excludes_symlinks_from_reads_and_rejects_symlink_writes() {
        use std::os::unix::fs::symlink;

        let root = test_root("symlink");
        let service = service_in(&root);
        let task_dir = service.plans_dir.join("TASK-1");
        let outside = root.join("outside.md");
        fs::create_dir_all(&task_dir).unwrap();
        fs::create_dir_all(task_dir.join("real")).unwrap();
        fs::write(&outside, "secret").unwrap();
        fs::write(task_dir.join("real/detail.md"), "inside").unwrap();
        symlink(&outside, task_dir.join("plan.md")).unwrap();
        symlink(task_dir.join("real"), task_dir.join("alias")).unwrap();

        assert!(service.list_plans().unwrap().plans.is_empty());
        let plan = service.load_plan("TASK-1").unwrap().unwrap();
        assert_eq!(plan.files.len(), 1);
        assert_eq!(plan.files[0].filename, "real/detail.md");
        assert!(service
            .save_plan_file("TASK-1", "plan.md", "overwrite", "secret")
            .is_err());
        assert!(service
            .save_plan_file("TASK-1", "alias/detail.md", "overwrite", "inside")
            .is_err());
        assert_eq!(fs::read_to_string(outside).unwrap(), "secret");
        assert_eq!(
            fs::read_to_string(task_dir.join("real/detail.md")).unwrap(),
            "inside"
        );

        remove_test_root(root);
    }

    fn service_in(root: &Path) -> LocalDataService {
        LocalDataService::from_config(
            Some(root.join("data").into_os_string()),
            Some(root.join("plans").into_os_string()),
            &root.join("home"),
        )
        .unwrap()
    }

    fn test_root(label: &str) -> PathBuf {
        let suffix = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "my-workbench-local-data-{label}-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn remove_test_root(path: PathBuf) {
        fs::remove_dir_all(path).unwrap();
    }
}
