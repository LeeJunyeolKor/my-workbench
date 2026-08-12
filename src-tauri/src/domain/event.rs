use crate::domain::task::TaskId;
use crate::services::git_service::ChangedFileStatus;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OutputStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AgentEvent {
    TaskStarted {
        task_id: TaskId,
        worktree_path: String,
    },

    Output {
        task_id: TaskId,
        stream: OutputStream,
        content: String,
    },

    FileChanged {
        task_id: TaskId,
        path: String,
        status: ChangedFileStatus,
    },

    Progress {
        task_id: TaskId,
        message: String,
    },

    TaskCompleted {
        task_id: TaskId,
    },

    TaskFailed {
        task_id: TaskId,
        error: String,
    },

    TaskCancelled {
        task_id: TaskId,
    },
}

impl AgentEvent {
    pub fn task_id(&self) -> &TaskId {
        match self {
            AgentEvent::TaskStarted { task_id, .. } => task_id,
            AgentEvent::Output { task_id, .. } => task_id,
            AgentEvent::FileChanged { task_id, .. } => task_id,
            AgentEvent::Progress { task_id, .. } => task_id,
            AgentEvent::TaskCompleted { task_id } => task_id,
            AgentEvent::TaskFailed { task_id, .. } => task_id,
            AgentEvent::TaskCancelled { task_id } => task_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_serde_serialization() {
        let event = AgentEvent::TaskStarted {
            task_id: TaskId("task-123".into()),
            worktree_path: "/tmp/wt-123".into(),
        };

        let json = serde_json::to_string(&event).expect("Serialize failed");
        assert!(json.contains(r#""type":"TaskStarted""#));
        assert!(json.contains(r#""task_id":"task-123""#));

        let deserialized: AgentEvent = serde_json::from_str(&json).expect("Deserialize failed");
        assert_eq!(deserialized.task_id(), &TaskId("task-123".into()));
    }
}
