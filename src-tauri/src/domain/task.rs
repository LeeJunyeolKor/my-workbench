use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_TASK_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TaskId(pub String);

impl fmt::Display for TaskId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<&str> for TaskId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct WorkspaceId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: WorkspaceId,
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", content = "details")]
pub enum TaskStatus {
    Created,
    Preparing,
    Running,
    Completed,
    Failed(String),
    Cancelled,
}

impl TaskStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            TaskStatus::Completed | TaskStatus::Failed(_) | TaskStatus::Cancelled
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: TaskId,
    pub workspace_path: String,
    pub worktree_path: Option<String>,
    pub branch_name: Option<String>,
    pub status: TaskStatus,
    pub prompt: String,
    pub agent_type: String,
    pub created_at: String,
}

impl Task {
    pub fn new(workspace_path: String, prompt: String, agent_type: String) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        let sequence = NEXT_TASK_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let unique_value = now.as_nanos() ^ u128::from(sequence);
        let id = format!("task-{}", unique_value);
        let created_at = now.as_millis().to_string();

        Self {
            id: TaskId(id),
            workspace_path,
            worktree_path: None,
            branch_name: None,
            status: TaskStatus::Created,
            prompt,
            agent_type,
            created_at,
        }
    }

    pub fn transition_to(&mut self, next: TaskStatus) -> Result<(), String> {
        if self.status.is_terminal() {
            return Err(format!(
                "Cannot transition terminal state {:?} to {:?}",
                self.status, next
            ));
        }

        let is_allowed = matches!(
            (&self.status, &next),
            (TaskStatus::Created, TaskStatus::Preparing)
                | (TaskStatus::Created, TaskStatus::Failed(_))
                | (TaskStatus::Created, TaskStatus::Cancelled)
                | (TaskStatus::Preparing, TaskStatus::Running)
                | (TaskStatus::Preparing, TaskStatus::Failed(_))
                | (TaskStatus::Preparing, TaskStatus::Cancelled)
                | (TaskStatus::Running, TaskStatus::Completed)
                | (TaskStatus::Running, TaskStatus::Failed(_))
                | (TaskStatus::Running, TaskStatus::Cancelled)
        );

        if !is_allowed {
            return Err(format!(
                "Invalid task transition {:?} -> {:?}",
                self.status, next
            ));
        }

        self.status = next;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_lifecycle_transitions() {
        let mut task = Task::new("/tmp/repo".into(), "Refactor".into(), "codex".into());
        assert_eq!(task.status, TaskStatus::Created);

        assert!(task.transition_to(TaskStatus::Preparing).is_ok());
        assert_eq!(task.status, TaskStatus::Preparing);

        assert!(task.transition_to(TaskStatus::Running).is_ok());
        assert_eq!(task.status, TaskStatus::Running);

        assert!(task.transition_to(TaskStatus::Completed).is_ok());
        assert_eq!(task.status, TaskStatus::Completed);
        assert!(task.status.is_terminal());

        assert!(task.transition_to(TaskStatus::Running).is_err());
    }

    #[test]
    fn test_invalid_non_terminal_transition_is_rejected() {
        let mut task = Task::new("/tmp/repo".into(), "Refactor".into(), "codex".into());
        assert!(task.transition_to(TaskStatus::Completed).is_err());
        assert_eq!(task.status, TaskStatus::Created);
    }
}
