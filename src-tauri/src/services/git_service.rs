use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use tokio::process::Command;

const BINARY_DIFF_FALLBACK: &str = "Binary file — preview unavailable";

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
    pub async fn create_worktree(
        repo_path: &str,
        task_id: &str,
    ) -> Result<(String, String), String> {
        let repo_metadata = tokio::fs::metadata(repo_path)
            .await
            .map_err(|error| format!("Invalid repository path: {}", error))?;
        if !repo_metadata.is_dir() {
            return Err("Repository path must be a directory".to_string());
        }

        let branch_name = format!("my-workbench/wt-{}", task_id);
        let worktree_dir_name = format!(".my-workbench-worktrees/wt-{}", task_id);
        let worktree_full_path = Path::new(repo_path).join(&worktree_dir_name);

        if let Some(parent) = worktree_full_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create worktree parent dir: {}", e))?;
        }

        let output = Command::new("git")
            .current_dir(repo_path)
            .args([
                "worktree",
                "add",
                "-b",
                &branch_name,
                worktree_full_path.to_str().unwrap_or_default(),
            ])
            .output()
            .await
            .map_err(|error| format!("Failed to run git worktree add: {}", error))?;

        if output.status.success() {
            return Ok((
                worktree_full_path.to_string_lossy().to_string(),
                branch_name,
            ));
        }

        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !is_non_git_error(&error) {
            return Err(if error.is_empty() {
                "git worktree add failed".to_string()
            } else {
                error
            });
        }

        // A plain directory is an explicit preview workspace for a directory that is not a
        // Git repository. Branch conflicts and other Git errors must be surfaced to the caller.
        tokio::fs::create_dir_all(&worktree_full_path)
            .await
            .map_err(|e| format!("Fallback dir creation failed: {}", e))?;
        Ok((
            worktree_full_path.to_string_lossy().to_string(),
            branch_name,
        ))
    }

    pub async fn get_changed_files(worktree_path: &str) -> Result<Vec<ChangedFile>, String> {
        let output = Command::new("git")
            .current_dir(worktree_path)
            .args(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
            .output()
            .await
            .map_err(|e| format!("Failed to run git status: {}", e))?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if is_non_git_error(&error) {
                return scan_fallback_files(worktree_path).await;
            }
            return Err(if error.is_empty() {
                "git status failed".to_string()
            } else {
                error
            });
        }

        Ok(parse_git_status_porcelain_bytes(&output.stdout))
    }

    pub async fn get_diff(worktree_path: &str, file_path: &str) -> Result<String, String> {
        let _ = validate_diff_path(worktree_path, file_path).await?;
        // Revalidate immediately before invoking Git as well as before the fallback read.
        let _ = validate_diff_path(worktree_path, file_path).await?;
        let output = Command::new("git")
            .current_dir(worktree_path)
            .args(["diff", "HEAD", "--", file_path])
            .output()
            .await
            .map_err(|e| format!("Failed to run git diff: {}", e))?;

        if output.status.success() && !output.stdout.is_empty() {
            return Ok(format_diff_output(&output.stdout));
        }

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if !is_non_git_error(&error) && !is_unborn_repository_error(&error) {
                return Err(if error.is_empty() {
                    "git diff failed".to_string()
                } else {
                    error
                });
            }
        } else if is_tracked_file(worktree_path, file_path).await {
            // A tracked file with no diff should not be presented as an untracked preview.
            return Ok(String::new());
        }

        // Untracked files and plain-directory preview workspaces do not appear in `git diff
        // HEAD`. Revalidate immediately before reading so a symlink/file swap cannot redirect
        // the fallback read outside the selected worktree.
        let safe_path = validate_diff_path(worktree_path, file_path).await?;
        match tokio::fs::read(safe_path).await {
            Ok(content) if content.is_empty() => Ok(format!("+++ {}\n", file_path)),
            Ok(content) => Ok(format_untracked_preview(file_path, &content)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(error) => Err(format!("Failed to read file diff: {}", error)),
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

fn is_non_git_error(error: &str) -> bool {
    error.to_ascii_lowercase().contains("not a git repository")
}

fn is_unborn_repository_error(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    (lower.contains("unknown revision") && lower.contains("head"))
        || lower.contains("ambiguous argument 'head'")
        || (lower.contains("bad revision") && lower.contains("head"))
        || lower.contains("does not have any commits yet")
}

async fn is_tracked_file(worktree_path: &str, file_path: &str) -> bool {
    Command::new("git")
        .current_dir(worktree_path)
        .args(["ls-files", "--error-unmatch", "--", file_path])
        .output()
        .await
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn scan_fallback_files(worktree_path: &str) -> Result<Vec<ChangedFile>, String> {
    let root = tokio::fs::canonicalize(worktree_path)
        .await
        .map_err(|error| format!("Invalid fallback workspace: {}", error))?;
    let mut directories = vec![root.clone()];
    let mut changed_files = Vec::new();

    while let Some(directory) = directories.pop() {
        let mut entries = tokio::fs::read_dir(&directory)
            .await
            .map_err(|error| format!("Failed to scan fallback workspace: {}", error))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|error| format!("Failed to scan fallback workspace: {}", error))?
        {
            let file_type = entry
                .file_type()
                .await
                .map_err(|error| format!("Failed to inspect fallback file: {}", error))?;
            let path = entry.path();
            if file_type.is_dir() {
                if entry.file_name() != ".git" {
                    directories.push(path);
                }
                continue;
            }
            if !file_type.is_file() {
                continue;
            }

            let relative = path
                .strip_prefix(&root)
                .map_err(|error| format!("Failed to relativize fallback file: {}", error))?;
            changed_files.push(ChangedFile {
                path: relative
                    .to_string_lossy()
                    .replace(std::path::MAIN_SEPARATOR, "/"),
                status: ChangedFileStatus::Untracked,
            });
        }
    }

    changed_files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(changed_files)
}

async fn validate_diff_path(worktree_path: &str, file_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(file_path);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("Diff path must stay inside the selected worktree".to_string());
    }

    let root = tokio::fs::canonicalize(worktree_path)
        .await
        .map_err(|e| format!("Invalid worktree path: {}", e))?;
    let candidate = root.join(relative);

    match tokio::fs::symlink_metadata(&candidate).await {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err("Diff path must not be a symlink".to_string())
        }
        Ok(metadata) if metadata.is_dir() => Err("Diff path must point to a file".to_string()),
        Ok(_) => {
            let canonical = tokio::fs::canonicalize(&candidate)
                .await
                .map_err(|e| format!("Invalid diff path: {}", e))?;
            if !canonical.starts_with(&root) {
                return Err("Diff path must stay inside the selected worktree".to_string());
            }
            Ok(canonical)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(candidate),
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
    async fn test_create_worktree_falls_back_only_for_non_git_directories() {
        let root = unique_test_path("non-git");
        tokio::fs::create_dir_all(&root).await.unwrap();

        let (worktree_path, branch_name) =
            GitService::create_worktree(root.to_str().unwrap(), "preview")
                .await
                .unwrap();

        assert_eq!(branch_name, "my-workbench/wt-preview");
        assert!(Path::new(&worktree_path).is_dir());
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn test_create_worktree_rejects_a_file_as_repository_path() {
        let path = unique_test_path("file");
        tokio::fs::write(&path, b"not a directory").await.unwrap();

        let error = GitService::create_worktree(path.to_str().unwrap(), "invalid")
            .await
            .unwrap_err();

        assert!(error.contains("Repository path must be a directory"));
        tokio::fs::remove_file(path).await.unwrap();
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
