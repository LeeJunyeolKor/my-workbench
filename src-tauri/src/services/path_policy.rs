use std::ffi::OsString;
use std::fs;
use std::path::{Component, Path, PathBuf};

const WORKSPACE_ROOTS_ENV: &str = "WORKBENCH_WORKSPACE_ROOTS";

#[derive(Debug)]
pub struct AllowedWorkspaceRoots {
    roots: Vec<PathBuf>,
}

impl AllowedWorkspaceRoots {
    pub fn from_env() -> Self {
        Self::from_env_value(
            std::env::var_os(WORKSPACE_ROOTS_ENV),
            home_directory().as_deref(),
        )
    }

    fn from_env_value(value: Option<OsString>, home: Option<&Path>) -> Self {
        let roots = value
            .as_deref()
            .map(std::env::split_paths)
            .into_iter()
            .flatten()
            .filter(|path| !path.as_os_str().is_empty())
            .filter_map(|path| {
                let expanded = expand_home(&path, home);
                expanded
                    .is_absolute()
                    .then(|| canonical_directory(&expanded).ok())
                    .flatten()
            })
            .fold(Vec::new(), |mut roots, root| {
                if !roots.contains(&root) {
                    roots.push(root);
                }
                roots
            });

        Self { roots }
    }

    pub fn resolve_allowed_directory(&self, input: &str) -> Result<PathBuf, String> {
        if self.roots.is_empty() {
            return Err(format!(
                "{WORKSPACE_ROOTS_ENV}가 My Workbench 데스크톱 앱 프로세스 환경에 설정되지 않았습니다. 앱을 종료한 뒤 환경변수를 설정하고 다시 실행해 주세요."
            ));
        }

        let candidate = canonical_directory(&expand_home(
            Path::new(input.trim()),
            home_directory().as_deref(),
        ))
        .map_err(|error| format!("올바른 작업공간 디렉터리가 아닙니다: {error}"))?;

        if self.roots.iter().any(|root| candidate.starts_with(root)) {
            Ok(candidate)
        } else {
            Err(format!(
                "작업공간 경로가 {WORKSPACE_ROOTS_ENV} 허용 범위 밖에 있습니다."
            ))
        }
    }
}

pub fn validate_relative_file_path(input: &str) -> Result<PathBuf, String> {
    let path = Path::new(input);
    let mut has_normal_component = false;

    if path.is_absolute()
        || path.components().any(|component| match component {
            Component::Normal(_) => {
                has_normal_component = true;
                false
            }
            Component::CurDir => false,
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => true,
        })
        || !has_normal_component
    {
        return Err("파일 경로는 선택한 작업공간 안의 상대 경로여야 합니다.".to_string());
    }

    Ok(path.to_path_buf())
}

fn canonical_directory(path: &Path) -> Result<PathBuf, std::io::Error> {
    let canonical = fs::canonicalize(path)?;
    if fs::metadata(&canonical)?.is_dir() {
        Ok(canonical)
    } else {
        Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "path is not a directory",
        ))
    }
}

fn expand_home(path: &Path, home: Option<&Path>) -> PathBuf {
    let Ok(remainder) = path.strip_prefix("~") else {
        return path.to_path_buf();
    };
    match home {
        Some(home) => home.join(remainder),
        None => path.to_path_buf(),
    }
}

fn home_directory() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_when_no_workspace_roots_are_configured() {
        let policy = AllowedWorkspaceRoots { roots: Vec::new() };

        let error = policy.resolve_allowed_directory("/tmp").unwrap_err();

        assert!(error.contains(WORKSPACE_ROOTS_ENV));
        assert!(error.contains("프로세스 환경"));
    }

    #[test]
    fn accepts_a_descendant_but_rejects_a_prefix_sibling() {
        let container = unique_test_path("containment");
        let allowed = container.join("allowed");
        let descendant = allowed.join("repo");
        let sibling = container.join("allowed-other");
        fs::create_dir_all(&descendant).unwrap();
        fs::create_dir_all(&sibling).unwrap();
        let policy = AllowedWorkspaceRoots {
            roots: vec![fs::canonicalize(&allowed).unwrap()],
        };

        assert_eq!(
            policy
                .resolve_allowed_directory(descendant.to_str().unwrap())
                .unwrap(),
            fs::canonicalize(&descendant).unwrap()
        );
        assert!(policy
            .resolve_allowed_directory(sibling.to_str().unwrap())
            .is_err());

        fs::remove_dir_all(container).unwrap();
    }

    #[test]
    fn expands_home_and_splits_configured_roots() {
        let container = unique_test_path("env");
        let home_root = container.join("home");
        let other_root = container.join("other");
        fs::create_dir_all(home_root.join("Projects")).unwrap();
        fs::create_dir_all(&other_root).unwrap();
        let value = std::env::join_paths([Path::new("~/Projects"), &other_root]).unwrap();

        let policy = AllowedWorkspaceRoots::from_env_value(Some(value), Some(&home_root));

        assert_eq!(policy.roots.len(), 2);
        assert!(policy
            .roots
            .contains(&fs::canonicalize(home_root.join("Projects")).unwrap()));
        assert!(policy
            .roots
            .contains(&fs::canonicalize(&other_root).unwrap()));

        fs::remove_dir_all(container).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlink_that_resolves_outside_an_allowed_root() {
        use std::os::unix::fs::symlink;

        let container = unique_test_path("symlink");
        let allowed = container.join("allowed");
        let outside = container.join("outside");
        fs::create_dir_all(&allowed).unwrap();
        fs::create_dir_all(&outside).unwrap();
        symlink(&outside, allowed.join("escape")).unwrap();
        let policy = AllowedWorkspaceRoots {
            roots: vec![fs::canonicalize(&allowed).unwrap()],
        };

        assert!(policy
            .resolve_allowed_directory(allowed.join("escape").to_str().unwrap())
            .is_err());

        fs::remove_dir_all(container).unwrap();
    }

    #[test]
    fn rejects_absolute_parent_and_empty_file_paths() {
        assert!(validate_relative_file_path("/tmp/file").is_err());
        assert!(validate_relative_file_path("../file").is_err());
        assert!(validate_relative_file_path("src/../secret").is_err());
        assert!(validate_relative_file_path(".").is_err());
        assert_eq!(
            validate_relative_file_path("./src/main.rs").unwrap(),
            PathBuf::from("./src/main.rs")
        );
    }

    fn unique_test_path(label: &str) -> PathBuf {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "my-workbench-path-policy-{label}-{}-{timestamp}",
            std::process::id()
        ))
    }
}
