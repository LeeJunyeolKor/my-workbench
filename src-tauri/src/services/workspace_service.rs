use crate::domain::task::{Workspace, WorkspaceId};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct WorkspaceService;

impl WorkspaceService {
    pub fn select_workspace(path: String) -> Workspace {
        let name = std::path::Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("workspace")
            .to_string();

        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_nanos();
        let id = format!("ws-{}", nanos);

        Workspace {
            id: WorkspaceId(id),
            path,
            name,
        }
    }
}
