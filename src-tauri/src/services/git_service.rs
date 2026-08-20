use crate::services::path_policy::validate_relative_file_path;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::sync::mpsc;

const BINARY_DIFF_FALLBACK: &str = "바이너리 파일은 미리볼 수 없습니다.";
const LARGE_DIFF_FALLBACK: &str = "파일이 1 MiB 미리보기 제한을 초과했습니다.";
const LARGE_CHANGED_FILES_ERROR: &str = "변경 파일 목록이 1 MiB 제한을 초과했습니다.";
const MAX_DIFF_PREVIEW_BYTES: usize = 1024 * 1024;

enum BoundedCommandOutput {
    Complete(Output),
    TooLarge,
}

#[derive(Clone, Copy)]
enum GitOutputStream {
    Stdout,
    Stderr,
}

struct BoundedOutput {
    bytes: Vec<u8>,
    exceeded: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangedFileStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Untracked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: ChangedFileStatus,
}

pub struct GitService;

impl GitService {
    pub async fn resolve_git_workspace(path: &Path) -> Result<PathBuf, String> {
        let canonical = tokio::fs::canonicalize(path)
            .await
            .map_err(|error| format!("Invalid Git workspace path: {error}"))?;
        let metadata = tokio::fs::metadata(&canonical)
            .await
            .map_err(|error| format!("Invalid Git workspace path: {error}"))?;
        if !metadata.is_dir() {
            return Err("Git workspace path must be a directory".to_string());
        }

        let output = Command::new("git")
            .current_dir(&canonical)
            .args(["rev-parse", "--show-toplevel"])
            .output()
            .await
            .map_err(|error| format!("Failed to inspect Git workspace: {error}"))?;
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if error.is_empty() {
                "Workspace must be a Git worktree".to_string()
            } else {
                error
            });
        }

        let reported_root = std::str::from_utf8(&output.stdout)
            .map_err(|_| "Git worktree root must be a UTF-8 path".to_string())?
            .trim();
        let reported_root = tokio::fs::canonicalize(reported_root)
            .await
            .map_err(|error| format!("Invalid Git worktree root: {error}"))?;
        if reported_root != canonical {
            return Err("Workspace path must point to a Git worktree root".to_string());
        }

        Ok(canonical)
    }

    pub async fn create_worktree(
        repo_path: &str,
        task_id: &str,
    ) -> Result<(String, String), String> {
        if task_id.is_empty()
            || !task_id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            return Err("Invalid task id for worktree creation".to_string());
        }

        let repo_path = Self::resolve_git_workspace(Path::new(repo_path)).await?;
        let branch_name = format!("my-workbench/wt-{}", task_id);
        let worktree_parent = prepare_worktree_parent(&repo_path).await?;
        let worktree_full_path = worktree_parent.join(format!("wt-{task_id}"));
        match tokio::fs::symlink_metadata(&worktree_full_path).await {
            Ok(_) => return Err("Worktree target path already exists".to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Failed to inspect worktree target: {error}")),
        }

        let output = Command::new("git")
            .current_dir(&repo_path)
            .arg("worktree")
            .arg("add")
            .arg("-b")
            .arg(&branch_name)
            .arg(&worktree_full_path)
            .output()
            .await
            .map_err(|error| format!("Failed to run git worktree add: {}", error))?;

        if output.status.success() {
            let canonical_worktree = tokio::fs::canonicalize(&worktree_full_path)
                .await
                .map_err(|error| format!("Invalid created worktree path: {error}"))?;
            if !canonical_worktree.starts_with(&worktree_parent) {
                return Err("Created worktree escaped its repository directory".to_string());
            }
            return Ok((
                canonical_worktree.to_string_lossy().to_string(),
                branch_name,
            ));
        }

        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if error.is_empty() {
            "git worktree add failed".to_string()
        } else {
            error
        })
    }

    pub async fn get_changed_files(worktree_path: &str) -> Result<Vec<ChangedFile>, String> {
        let worktree_path = Self::resolve_git_workspace(Path::new(worktree_path)).await?;
        let mut command = Command::new("git");
        command.current_dir(&worktree_path).args([
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
        ]);
        let output = match run_bounded_command(command, "git status").await? {
            BoundedCommandOutput::Complete(output) => output,
            BoundedCommandOutput::TooLarge => return Err(LARGE_CHANGED_FILES_ERROR.to_string()),
        };

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if error.is_empty() {
                "git status failed".to_string()
            } else {
                error
            });
        }

        Ok(parse_git_status_porcelain_bytes(&output.stdout))
    }

    pub async fn get_diff(worktree_path: &str, file_path: &str) -> Result<String, String> {
        let worktree_path = Self::resolve_git_workspace(Path::new(worktree_path)).await?;
        let relative_path = validate_relative_file_path(file_path)?;
        let output = match run_git_diff(&worktree_path, &relative_path, false).await? {
            BoundedCommandOutput::Complete(output) => output,
            BoundedCommandOutput::TooLarge => return Ok(LARGE_DIFF_FALLBACK.to_string()),
        };

        if output.status.success() && !output.stdout.is_empty() {
            return Ok(format_diff_output(&output.stdout));
        }

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if !is_unborn_repository_error(&error) {
                return Err(if error.is_empty() {
                    "git diff failed".to_string()
                } else {
                    error
                });
            }

            let staged_output = match run_git_diff(&worktree_path, &relative_path, true).await? {
                BoundedCommandOutput::Complete(output) => output,
                BoundedCommandOutput::TooLarge => return Ok(LARGE_DIFF_FALLBACK.to_string()),
            };
            if !staged_output.status.success() {
                let error = String::from_utf8_lossy(&staged_output.stderr)
                    .trim()
                    .to_string();
                return Err(if error.is_empty() {
                    "git diff --cached failed".to_string()
                } else {
                    error
                });
            }
            if !staged_output.stdout.is_empty() {
                return Ok(format_diff_output(&staged_output.stdout));
            }
        } else if is_tracked_file(&worktree_path, &relative_path).await {
            // A tracked file with no diff should not be presented as an untracked preview.
            return Ok(String::new());
        }

        // Only a non-ignored untracked file reported by Git may use the raw-text preview. This
        // prevents direct IPC requests from reading arbitrary files such as `.git/config` or an
        // ignored `.env` inside an otherwise allowed repository.
        if !is_untracked_file(&worktree_path, &relative_path).await {
            return Ok(String::new());
        }

        let Some(safe_path) = resolve_existing_diff_file(&worktree_path, &relative_path).await?
        else {
            return Ok(String::new());
        };
        let file = match tokio::fs::File::open(safe_path).await {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
            Err(error) => return Err(format!("Failed to read file diff: {}", error)),
        };
        let mut content = Vec::with_capacity(MAX_DIFF_PREVIEW_BYTES.min(8192));
        file.take((MAX_DIFF_PREVIEW_BYTES + 1) as u64)
            .read_to_end(&mut content)
            .await
            .map_err(|error| format!("Failed to read file diff: {error}"))?;
        if content.len() > MAX_DIFF_PREVIEW_BYTES {
            return Ok(LARGE_DIFF_FALLBACK.to_string());
        }
        if content.is_empty() {
            Ok(format!("+++ {}\n", file_path))
        } else {
            Ok(format_untracked_preview(file_path, &content))
        }
    }
}

pub fn parse_git_status_porcelain_bytes(output: &[u8]) -> Vec<ChangedFile> {
    let mut fields = output
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let mut changed_files = Vec::new();

    while let Some(field) = fields.next() {
        if field.len() < 3 {
            continue;
        }

        let Some((status, has_second_path)) = classify_status(&field[..2]) else {
            continue;
        };
        let path = path_from_bytes(&field[3..]);

        // With porcelain v1 -z, rename/copy records are `to\0from\0`; the first path is the
        // destination and is the path the UI should inspect. Consume the source field even
        // though ChangedFile intentionally exposes only one path.
        if has_second_path {
            let _ = fields.next();
        }

        if !path.is_empty() {
            changed_files.push(ChangedFile { path, status });
        }
    }

    changed_files
}

/// Compatibility parser for human-readable porcelain v1 output used by unit tests and callers
/// that already have a UTF-8, newline-delimited status string. Runtime Git queries use the -z
/// byte parser above so newlines, tabs, quotes, and literal ` -> ` sequences remain lossless.
pub fn parse_git_status_porcelain(output: &str) -> Vec<ChangedFile> {
    output.lines().filter_map(parse_git_status_line).collect()
}

fn parse_git_status_line(line: &str) -> Option<ChangedFile> {
    if line.len() < 3 {
        return None;
    }

    let (status, has_second_path) = classify_status(&line.as_bytes()[..2])?;
    let raw_path = &line[3..];
    if raw_path.is_empty() {
        return None;
    }

    let path = if has_second_path {
        raw_path
            .rsplit_once(" -> ")
            .map(|(_, new_path)| new_path)
            .unwrap_or(raw_path)
    } else {
        raw_path
    };
    let path = decode_git_quoted_path(path);

    if path.is_empty() {
        None
    } else {
        Some(ChangedFile { path, status })
    }
}

fn classify_status(xy: &[u8]) -> Option<(ChangedFileStatus, bool)> {
    if xy.len() < 2 {
        return None;
    }

    let x = xy[0];
    let y = xy[1];
    if x == b'?' || y == b'?' {
        return Some((ChangedFileStatus::Untracked, false));
    }
    if x == b'R' || y == b'R' {
        return Some((ChangedFileStatus::Renamed, true));
    }
    if x == b'C' || y == b'C' {
        // The enum has no separate copied state; the destination is a newly materialized file.
        return Some((ChangedFileStatus::Added, true));
    }
    if x == b'U' || y == b'U' {
        // Unmerged entries need visibility in the changed-file list; Modified is the closest
        // existing UI category without inventing a new wire enum.
        return Some((ChangedFileStatus::Modified, false));
    }
    if x == b'A' || y == b'A' {
        return Some((ChangedFileStatus::Added, false));
    }
    if x == b'D' || y == b'D' {
        return Some((ChangedFileStatus::Deleted, false));
    }
    if x == b'M' || y == b'M' || x == b'T' || y == b'T' {
        // Type changes are shown as Modified because the product enum is intentionally compact.
        return Some((ChangedFileStatus::Modified, false));
    }

    None
}

fn path_from_bytes(path: &[u8]) -> String {
    String::from_utf8_lossy(path).into_owned()
}

fn decode_git_quoted_path(path: &str) -> String {
    let bytes = path.as_bytes();
    if bytes.len() < 2 || bytes[0] != b'"' || bytes[bytes.len() - 1] != b'"' {
        return path.to_string();
    }

    let mut decoded = Vec::with_capacity(bytes.len() - 2);
    let mut index = 1;
    while index < bytes.len() - 1 {
        let byte = bytes[index];
        if byte != b'\\' {
            decoded.push(byte);
            index += 1;
            continue;
        }

        index += 1;
        if index >= bytes.len() - 1 {
            decoded.push(b'\\');
            break;
        }
        match bytes[index] {
            b'a' => decoded.push(0x07),
            b'b' => decoded.push(0x08),
            b't' => decoded.push(b'\t'),
            b'n' => decoded.push(b'\n'),
            b'v' => decoded.push(0x0b),
            b'f' => decoded.push(0x0c),
            b'r' => decoded.push(b'\r'),
            b'"' => decoded.push(b'"'),
            b'\\' => decoded.push(b'\\'),
            b'0'..=b'7' => {
                let mut value = bytes[index] - b'0';
                let mut consumed = 1;
                while consumed < 3
                    && index + consumed + 1 < bytes.len()
                    && (b'0'..=b'7').contains(&bytes[index + consumed])
                {
                    value = value * 8 + (bytes[index + consumed] - b'0');
                    consumed += 1;
                }
                decoded.push(value);
                index += consumed - 1;
            }
            other => decoded.push(other),
        }
        index += 1;
    }

    String::from_utf8_lossy(&decoded).into_owned()
}

fn format_diff_output(bytes: &[u8]) -> String {
    if is_binary_content(bytes)
        || bytes
            .windows(b"Binary files ".len())
            .any(|window| window == b"Binary files ")
        || bytes
            .windows(b"GIT binary patch".len())
            .any(|window| window == b"GIT binary patch")
    {
        return BINARY_DIFF_FALLBACK.to_string();
    }
    String::from_utf8_lossy(bytes).to_string()
}

fn format_untracked_preview(file_path: &str, bytes: &[u8]) -> String {
    if is_binary_content(bytes) {
        BINARY_DIFF_FALLBACK.to_string()
    } else {
        format!("+++ {}\n{}", file_path, String::from_utf8_lossy(bytes))
    }
}

fn is_binary_content(bytes: &[u8]) -> bool {
    std::str::from_utf8(bytes).is_err() || bytes.contains(&0)
}

fn is_unborn_repository_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    (lower.contains("unknown revision") && lower.contains("head"))
        || lower.contains("ambiguous argument 'head'")
        || (lower.contains("bad revision") && lower.contains("head"))
        || lower.contains("does not have any commits yet")
}

async fn is_tracked_file(worktree_path: &Path, file_path: &Path) -> bool {
    Command::new("git")
        .current_dir(worktree_path)
        .arg("--literal-pathspecs")
        .arg("ls-files")
        .arg("--error-unmatch")
        .arg("--")
        .arg(file_path)
        .output()
        .await
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn run_git_diff(
    worktree_path: &Path,
    file_path: &Path,
    cached: bool,
) -> Result<BoundedCommandOutput, String> {
    let mut command = Command::new("git");
    command
        .current_dir(worktree_path)
        .arg("--literal-pathspecs")
        .arg("diff")
        .arg("--no-ext-diff")
        .arg("--no-textconv");
    if cached {
        command.arg("--cached");
    } else {
        command.arg("HEAD");
    }
    command.arg("--").arg(file_path);
    run_bounded_command(command, "git diff").await
}

async fn run_bounded_command(
    mut command: Command,
    operation: &str,
) -> Result<BoundedCommandOutput, String> {
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to run {operation}: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("Failed to capture {operation} stdout"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("Failed to capture {operation} stderr"))?;
    let (limit_tx, mut limit_rx) = mpsc::unbounded_channel();
    let stdout_task = tokio::spawn(read_bounded_output(
        stdout,
        GitOutputStream::Stdout,
        limit_tx.clone(),
    ));
    let stderr_task = tokio::spawn(read_bounded_output(
        stderr,
        GitOutputStream::Stderr,
        limit_tx,
    ));

    let mut stop_error = None;
    let status = tokio::select! {
        status = child.wait() => status,
        limit = limit_rx.recv() => {
            if limit.is_some() {
                match child.start_kill() {
                    Ok(()) => {}
                    Err(error) if matches!(
                        error.kind(),
                        std::io::ErrorKind::InvalidInput | std::io::ErrorKind::NotFound
                    ) => {}
                    Err(error) => {
                        stop_error = Some(format!("Failed to stop oversized {operation}: {error}"));
                    }
                }
            }
            child.wait().await
        }
    }
    .map_err(|error| format!("Failed to wait for {operation}: {error}"))?;

    let stdout = stdout_task
        .await
        .map_err(|error| format!("Failed to join {operation} stdout reader: {error}"))?
        .map_err(|error| format!("Failed to read {operation} stdout: {error}"))?;
    let stderr = stderr_task
        .await
        .map_err(|error| format!("Failed to join {operation} stderr reader: {error}"))?
        .map_err(|error| format!("Failed to read {operation} stderr: {error}"))?;

    if stdout.exceeded {
        return Ok(BoundedCommandOutput::TooLarge);
    }
    if stderr.exceeded {
        return Err(format!(
            "{operation} 오류 출력이 1 MiB 제한을 초과했습니다."
        ));
    }
    if let Some(error) = stop_error {
        return Err(error);
    }

    Ok(BoundedCommandOutput::Complete(Output {
        status,
        stdout: stdout.bytes,
        stderr: stderr.bytes,
    }))
}

async fn read_bounded_output<R: AsyncRead + Unpin>(
    mut reader: R,
    stream: GitOutputStream,
    limit_tx: mpsc::UnboundedSender<GitOutputStream>,
) -> Result<BoundedOutput, std::io::Error> {
    let mut bytes = Vec::with_capacity(MAX_DIFF_PREVIEW_BYTES.min(8192));
    let mut buffer = [0_u8; 8192];
    let mut exceeded = false;

    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        if exceeded {
            continue;
        }

        let remaining = (MAX_DIFF_PREVIEW_BYTES + 1).saturating_sub(bytes.len());
        bytes.extend_from_slice(&buffer[..read.min(remaining)]);
        if bytes.len() > MAX_DIFF_PREVIEW_BYTES {
            exceeded = true;
            let _ = limit_tx.send(stream);
        }
    }

    Ok(BoundedOutput { bytes, exceeded })
}

async fn is_untracked_file(worktree_path: &Path, file_path: &Path) -> bool {
    Command::new("git")
        .current_dir(worktree_path)
        .arg("--literal-pathspecs")
        .arg("ls-files")
        .arg("--others")
        .arg("--exclude-standard")
        .arg("-z")
        .arg("--")
        .arg(file_path)
        .output()
        .await
        .map(|output| output.status.success() && !output.stdout.is_empty())
        .unwrap_or(false)
}

async fn prepare_worktree_parent(repo_path: &Path) -> Result<PathBuf, String> {
    let parent = repo_path.join(".my-workbench-worktrees");
    match tokio::fs::symlink_metadata(&parent).await {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err("Worktree parent directory must not be a symlink".to_string());
        }
        Ok(metadata) if !metadata.is_dir() => {
            return Err("Worktree parent path must be a directory".to_string());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            tokio::fs::create_dir(&parent)
                .await
                .map_err(|error| format!("Failed to create worktree parent dir: {error}"))?;
        }
        Err(error) => return Err(format!("Failed to inspect worktree parent dir: {error}")),
    }

    let canonical = tokio::fs::canonicalize(&parent)
        .await
        .map_err(|error| format!("Invalid worktree parent dir: {error}"))?;
    if !canonical.starts_with(repo_path) {
        return Err("Worktree parent directory escaped its repository".to_string());
    }
    Ok(canonical)
}

async fn resolve_existing_diff_file(
    worktree_path: &Path,
    relative: &Path,
) -> Result<Option<PathBuf>, String> {
    let candidate = worktree_path.join(relative);

    match tokio::fs::symlink_metadata(&candidate).await {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err("Diff path must not be a symlink".to_string())
        }
        Ok(metadata) if metadata.is_dir() => Err("Diff path must point to a file".to_string()),
        Ok(_) => {
            let canonical = tokio::fs::canonicalize(&candidate)
                .await
                .map_err(|e| format!("Invalid diff path: {}", e))?;
            if !canonical.starts_with(worktree_path) {
                return Err("Diff path must stay inside the selected worktree".to_string());
            }
            Ok(Some(canonical))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Invalid diff path: {}", error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_changed_file_status_parsing() {
        let sample_output = concat!(
            " M src/modified.rs\n",
            "MM src/staged-and-modified.rs\n",
            " A src/added.rs\n",
            "AM src/added-and-modified.rs\n",
            " D src/deleted.rs\n",
            "R  old-name.rs -> new-name.rs\n",
            "?? temp.txt\n",
        );

        let files = parse_git_status_porcelain(sample_output);

        assert_eq!(files.len(), 7);
        assert_eq!(files[0].status, ChangedFileStatus::Modified);
        assert_eq!(files[1].status, ChangedFileStatus::Modified);
        assert_eq!(files[2].status, ChangedFileStatus::Added);
        assert_eq!(files[3].status, ChangedFileStatus::Added);
        assert_eq!(files[4].status, ChangedFileStatus::Deleted);
        assert_eq!(files[5].status, ChangedFileStatus::Renamed);
        assert_eq!(files[5].path, "new-name.rs");
        assert_eq!(files[6].status, ChangedFileStatus::Untracked);
    }

    #[test]
    fn test_zero_terminated_status_preserves_special_paths_and_maps_extra_states() {
        let output = b" M path with\nnewline.txt\0R  new -> literal\tname\0old name\0C  copied.txt\0source.txt\0T  mode-change\0UU conflicted.txt\0";
        let files = parse_git_status_porcelain_bytes(output);

        assert_eq!(
            files,
            vec![
                ChangedFile {
                    path: "path with\nnewline.txt".into(),
                    status: ChangedFileStatus::Modified,
                },
                ChangedFile {
                    path: "new -> literal\tname".into(),
                    status: ChangedFileStatus::Renamed,
                },
                ChangedFile {
                    path: "copied.txt".into(),
                    status: ChangedFileStatus::Added,
                },
                ChangedFile {
                    path: "mode-change".into(),
                    status: ChangedFileStatus::Modified,
                },
                ChangedFile {
                    path: "conflicted.txt".into(),
                    status: ChangedFileStatus::Modified,
                },
            ]
        );
    }

    #[test]
    fn test_quoted_git_path_decodes_octal_and_control_escapes() {
        let files = parse_git_status_porcelain("?? \"line\\012tab\\011quote\\\"\\\\.txt\"\n");
        assert_eq!(files[0].path, "line\ntab\tquote\"\\.txt");
    }

    #[test]
    fn test_unborn_repository_error_detection() {
        assert!(is_unborn_repository_error(
            "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree."
        ));
        assert!(is_unborn_repository_error("fatal: bad revision 'HEAD'"));
        assert!(is_unborn_repository_error(
            "fatal: your current branch does not have any commits yet"
        ));
        assert!(!is_unborn_repository_error(
            "fatal: ambiguous argument 'feature': unknown revision"
        ));
    }

    #[tokio::test]
    async fn test_non_git_workspaces_are_rejected_without_fallback_reads_or_scans() {
        let root = unique_test_path("non-git");
        tokio::fs::create_dir_all(&root).await.unwrap();
        tokio::fs::write(root.join("secret.txt"), b"must-not-be-returned")
            .await
            .unwrap();

        let create_error = GitService::create_worktree(root.to_str().unwrap(), "preview")
            .await
            .unwrap_err();
        let changed_error = GitService::get_changed_files(root.to_str().unwrap())
            .await
            .unwrap_err();
        let diff_error = GitService::get_diff(root.to_str().unwrap(), "secret.txt")
            .await
            .unwrap_err();

        assert!(create_error.to_ascii_lowercase().contains("git repository"));
        assert!(changed_error
            .to_ascii_lowercase()
            .contains("git repository"));
        assert!(diff_error.to_ascii_lowercase().contains("git repository"));
        assert!(!diff_error.contains("must-not-be-returned"));
        assert!(!root.join(".my-workbench-worktrees").exists());
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn test_create_worktree_rejects_a_file_as_repository_path() {
        let path = unique_test_path("file");
        tokio::fs::write(&path, b"not a directory").await.unwrap();

        let error = GitService::create_worktree(path.to_str().unwrap(), "invalid")
            .await
            .unwrap_err();

        assert!(error.contains("Git workspace path must be a directory"));
        tokio::fs::remove_file(path).await.unwrap();
    }

    #[tokio::test]
    async fn test_untracked_text_preview_is_kept_for_git_workspaces() {
        let root = unique_test_path("untracked");
        init_git_repo(&root).await;
        tokio::fs::write(root.join("notes.txt"), b"hello from git workspace\n")
            .await
            .unwrap();

        let diff = GitService::get_diff(root.to_str().unwrap(), "notes.txt")
            .await
            .unwrap();

        assert_eq!(diff, "+++ notes.txt\nhello from git workspace\n");
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn test_staged_file_diff_is_kept_for_unborn_git_workspaces() {
        let root = unique_test_path("unborn-staged");
        init_git_repo(&root).await;
        tokio::fs::write(root.join("staged.txt"), b"first staged content\n")
            .await
            .unwrap();
        let add = Command::new("git")
            .current_dir(&root)
            .args(["add", "--", "staged.txt"])
            .output()
            .await
            .unwrap();
        assert!(add.status.success());

        let diff = GitService::get_diff(root.to_str().unwrap(), "staged.txt")
            .await
            .unwrap();

        assert!(diff.contains("first staged content"));
        assert!(diff.contains("new file mode"));
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn test_untracked_preview_stops_at_the_size_limit() {
        let root = unique_test_path("large-untracked");
        init_git_repo(&root).await;
        tokio::fs::write(
            root.join("large.txt"),
            vec![b'a'; MAX_DIFF_PREVIEW_BYTES + 1],
        )
        .await
        .unwrap();

        let diff = GitService::get_diff(root.to_str().unwrap(), "large.txt")
            .await
            .unwrap();

        assert_eq!(diff, LARGE_DIFF_FALLBACK);
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn test_changed_file_list_stops_at_the_size_limit() {
        use std::fmt::Write as _;
        use tokio::io::AsyncWriteExt as _;

        let root = unique_test_path("large-status");
        init_git_repo(&root).await;
        let hash_output = Command::new("git")
            .current_dir(&root)
            .args(["hash-object", "-w", "--stdin"])
            .output()
            .await
            .unwrap();
        assert!(hash_output.status.success());
        let hash = String::from_utf8(hash_output.stdout)
            .unwrap()
            .trim()
            .to_string();
        let suffix = "x".repeat(220);
        let mut index_input = String::new();
        for index in 0..5000 {
            writeln!(index_input, "100644 {hash}\t{index:05}-{suffix}.txt").unwrap();
        }

        let mut update_index = Command::new("git");
        update_index
            .current_dir(&root)
            .args(["update-index", "--index-info"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        let mut update_index = update_index.spawn().unwrap();
        let mut stdin = update_index.stdin.take().unwrap();
        stdin.write_all(index_input.as_bytes()).await.unwrap();
        drop(stdin);
        let update_output = update_index.wait_with_output().await.unwrap();
        assert!(
            update_output.status.success(),
            "git update-index failed: {}",
            String::from_utf8_lossy(&update_output.stderr)
        );

        let error = GitService::get_changed_files(root.to_str().unwrap())
            .await
            .unwrap_err();

        assert_eq!(error, LARGE_CHANGED_FILES_ERROR);
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn test_tracked_diff_stops_at_the_size_limit() {
        let root = unique_test_path("large-tracked");
        init_git_repo(&root).await;
        let file_path = root.join("large.txt");
        tokio::fs::write(
            &file_path,
            "before\n".repeat(MAX_DIFF_PREVIEW_BYTES / 7 + 1),
        )
        .await
        .unwrap();
        let add = Command::new("git")
            .current_dir(&root)
            .args(["add", "--", "large.txt"])
            .output()
            .await
            .unwrap();
        assert!(add.status.success());
        let commit = Command::new("git")
            .current_dir(&root)
            .args([
                "-c",
                "user.name=My Workbench Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "--quiet",
                "-m",
                "initial",
            ])
            .output()
            .await
            .unwrap();
        assert!(
            commit.status.success(),
            "git commit failed: {}",
            String::from_utf8_lossy(&commit.stderr)
        );
        tokio::fs::write(&file_path, "after\n".repeat(MAX_DIFF_PREVIEW_BYTES / 6 + 1))
            .await
            .unwrap();

        let diff = GitService::get_diff(root.to_str().unwrap(), "large.txt")
            .await
            .unwrap();

        assert_eq!(diff, LARGE_DIFF_FALLBACK);
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn test_diff_does_not_read_git_metadata_or_ignored_files() {
        let root = unique_test_path("protected-diff-files");
        init_git_repo(&root).await;
        tokio::fs::write(root.join(".gitignore"), b".env\n")
            .await
            .unwrap();
        tokio::fs::write(root.join(".env"), b"SECRET=must-not-be-returned\n")
            .await
            .unwrap();

        let git_config = GitService::get_diff(root.to_str().unwrap(), ".git/config")
            .await
            .unwrap();
        let ignored_env = GitService::get_diff(root.to_str().unwrap(), ".env")
            .await
            .unwrap();

        assert!(git_config.is_empty());
        assert!(ignored_env.is_empty());
        assert!(!git_config.contains("repositoryformatversion"));
        assert!(!ignored_env.contains("must-not-be-returned"));
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn test_create_worktree_rejects_a_symlinked_parent() {
        use std::os::unix::fs::symlink;

        let container = unique_test_path("worktree-parent-symlink");
        let root = container.join("repo");
        let outside = container.join("outside");
        init_git_repo(&root).await;
        tokio::fs::create_dir_all(&outside).await.unwrap();
        symlink(&outside, root.join(".my-workbench-worktrees")).unwrap();

        let error = GitService::create_worktree(root.to_str().unwrap(), "safe-task")
            .await
            .unwrap_err();

        assert!(error.contains("must not be a symlink"));
        assert!(tokio::fs::read_dir(&outside)
            .await
            .unwrap()
            .next_entry()
            .await
            .unwrap()
            .is_none());
        tokio::fs::remove_dir_all(container).await.unwrap();
    }

    #[tokio::test]
    async fn test_diff_rejects_parent_traversal_in_a_git_workspace() {
        let root = unique_test_path("diff-traversal");
        init_git_repo(&root).await;

        let error = GitService::get_diff(root.to_str().unwrap(), "../secret.txt")
            .await
            .unwrap_err();

        assert!(error.contains("상대 경로"));
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    async fn init_git_repo(path: &Path) {
        tokio::fs::create_dir_all(path).await.unwrap();
        let output = Command::new("git")
            .arg("init")
            .arg("--quiet")
            .arg(path)
            .output()
            .await
            .unwrap();
        assert!(
            output.status.success(),
            "git init failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn unique_test_path(label: &str) -> std::path::PathBuf {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "my-workbench-git-service-{}-{}-{}",
            label,
            std::process::id(),
            timestamp
        ))
    }

    #[test]
    fn test_binary_diff_fallback() {
        assert_eq!(
            format_diff_output(b"Binary files a/image.png and b/image.png differ\n"),
            BINARY_DIFF_FALLBACK
        );
        assert_eq!(
            format_untracked_preview("image.png", &[0, 159]),
            BINARY_DIFF_FALLBACK
        );
    }
}
