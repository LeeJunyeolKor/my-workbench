use crate::domain::event::AgentEvent;
use crate::domain::task::{Task, TaskStatus};
use crate::process::runner::{AgentProcessRunner, ProcessOutputMessage};
use crate::services::git_service::GitService;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio::sync::oneshot;

const AGENT_EVENT_NAME: &str = "my-workbench:agent-event";

struct TaskLifecycle {
    cancellation_requested: bool,
    terminal_claimed: bool,
}

struct CancellationHandle {
    tx: oneshot::Sender<()>,
    completion_rx: oneshot::Receiver<Result<(), String>>,
    requested: Arc<AtomicBool>,
    lifecycle: Arc<Mutex<TaskLifecycle>>,
}

enum TerminalOutcome {
    Completed,
    Failed(String),
    Cancelled,
    NotWinner,
}

pub struct AgentServiceState {
    pub tasks: Arc<Mutex<HashMap<String, Task>>>,
    cancel_txs: Arc<Mutex<HashMap<String, CancellationHandle>>>,
}

impl Default for AgentServiceState {
    fn default() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            cancel_txs: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

pub struct AgentService;

impl AgentService {
    pub async fn start_task<R: tauri::Runtime>(
        app_handle: tauri::AppHandle<R>,
        state: &AgentServiceState,
        workspace_path: String,
        prompt: String,
        agent_type: String,
        execution_mode: Option<String>,
    ) -> Result<Task, String> {
        let mut task = Task::new(workspace_path.clone(), prompt.clone(), agent_type.clone());
        let task_id = task.id.clone();
        let task_id_str = task.id.0.clone();

        task.transition_to(TaskStatus::Preparing)?;
        insert_task(state, &task);

        let use_existing_workspace = execution_mode.as_deref() == Some("existing-worktree");
        let (worktree_path, branch_name) = if use_existing_workspace {
            let metadata = tokio::fs::metadata(&workspace_path)
                .await
                .map_err(|error| format!("Invalid existing workspace: {}", error));
            match metadata {
                Ok(metadata) if metadata.is_dir() => (workspace_path.clone(), None),
                Ok(_) => {
                    let error = "Existing workspace path must be a directory".to_string();
                    fail_task(state, &task_id_str, &task_id, &app_handle, error.clone());
                    let _ = task.transition_to(TaskStatus::Failed(error));
                    return Ok(task);
                }
                Err(error) => {
                    fail_task(state, &task_id_str, &task_id, &app_handle, error.clone());
                    let _ = task.transition_to(TaskStatus::Failed(error));
                    return Ok(task);
                }
            }
        } else {
            match GitService::create_worktree(&workspace_path, &task_id_str).await {
                Ok((path, branch)) => (path, Some(branch)),
                Err(error) => {
                    fail_task(state, &task_id_str, &task_id, &app_handle, error.clone());
                    let _ = task.transition_to(TaskStatus::Failed(error));
                    return Ok(task);
                }
            }
        };

        task.worktree_path = Some(worktree_path.clone());
        task.branch_name = branch_name;
        task.transition_to(TaskStatus::Running)?;
        insert_task(state, &task);

        let (runner, mut rx) = match AgentProcessRunner::spawn(&worktree_path, &agent_type, &prompt)
        {
            Ok(result) => result,
            Err(error) => {
                fail_task(state, &task_id_str, &task_id, &app_handle, error.clone());
                let _ = task.transition_to(TaskStatus::Failed(error));
                return Ok(task);
            }
        };

        let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
        let (completion_tx, completion_rx) = oneshot::channel::<Result<(), String>>();
        let cancel_requested = Arc::new(AtomicBool::new(false));
        let lifecycle = Arc::new(Mutex::new(TaskLifecycle {
            cancellation_requested: false,
            terminal_claimed: false,
        }));
        {
            let mut cancel_map = state.cancel_txs.lock().unwrap();
            cancel_map.insert(
                task_id_str.clone(),
                CancellationHandle {
                    tx: cancel_tx,
                    completion_rx,
                    requested: cancel_requested.clone(),
                    lifecycle: lifecycle.clone(),
                },
            );
        }

        let _ = app_handle.emit(
            AGENT_EVENT_NAME,
            AgentEvent::TaskStarted {
                task_id: task_id.clone(),
                worktree_path: worktree_path.clone(),
            },
        );

        let tasks_ref = state.tasks.clone();
        let cancel_map_ref = state.cancel_txs.clone();
        let app_handle_clone = app_handle.clone();
        let task_id_event = task_id.clone();
        let task_id_key = task_id_str.clone();
        let cancellation_flag = cancel_requested;
        let lifecycle_ref = lifecycle;

        tokio::spawn(async move {
            let terminal_request = loop {
                tokio::select! {
                    _ = &mut cancel_rx => {
                        let mut cancellation = Box::pin(runner.cancel());
                        let cancellation_result = loop {
                            tokio::select! {
                                result = &mut cancellation => break result,
                                msg = rx.recv() => {
                                    if msg.is_none() {
                                        break cancellation.await;
                                    }
                                    // Cancellation suppresses further output events, but the
                                    // receiver must keep draining so the runner can finish
                                    // killing/reaping the process and close both pipes.
                                }
                            }
                        };
                        break match cancellation_result {
                            Ok(()) => Some((TaskStatus::Cancelled, false)),
                            Err(error) if process_already_stopped(&error) => {
                                Some((TaskStatus::Cancelled, false))
                            }
                            Err(error) => Some((TaskStatus::Failed(error), false)),
                        };
                    }
                    msg = rx.recv() => {
                        match msg {
                            Some(ProcessOutputMessage::Line { stream, content }) => {
                                if !cancellation_flag.load(Ordering::SeqCst) {
                                    let _ = app_handle_clone.emit(
                                        AGENT_EVENT_NAME,
                                        AgentEvent::Output {
                                            task_id: task_id_event.clone(),
                                            stream,
                                            content,
                                        },
                                    );
                                }
                                continue;
                            }
                            Some(ProcessOutputMessage::Cancelled) => {
                                break Some((TaskStatus::Cancelled, false));
                            }
                            Some(ProcessOutputMessage::Finished { success, code }) => {
                                if cancellation_flag.load(Ordering::SeqCst) {
                                    break Some((TaskStatus::Cancelled, false));
                                }

                                if success {
                                    emit_changed_files(
                                        &tasks_ref,
                                        &task_id_key,
                                        &task_id_event,
                                        &app_handle_clone,
                                        &lifecycle_ref,
                                    )
                                    .await;

                                    break if is_cancellation_requested(&lifecycle_ref) {
                                        Some((TaskStatus::Cancelled, false))
                                    } else {
                                        Some((TaskStatus::Completed, true))
                                    };
                                }

                                break Some((
                                    TaskStatus::Failed(format!("Exited with code {:?}", code)),
                                    true,
                                ));
                            }
                            Some(ProcessOutputMessage::Failed { error }) => {
                                break Some((TaskStatus::Failed(error), true));
                            }
                            None => {
                                break if cancellation_flag.load(Ordering::SeqCst) {
                                    Some((TaskStatus::Cancelled, false))
                                } else {
                                    Some((
                                        TaskStatus::Failed(
                                            "Agent process output channel closed unexpectedly".to_string(),
                                        ),
                                        true,
                                    ))
                                };
                            }
                        }
                    }
                }
            };

            let completion_result =
                if let Some((desired_status, cancellation_wins)) = terminal_request {
                    let outcome = claim_terminal(
                        &tasks_ref,
                        &lifecycle_ref,
                        &task_id_key,
                        desired_status,
                        cancellation_wins,
                    );
                    let completion_result = match &outcome {
                        TerminalOutcome::Failed(error) => Err(error.clone()),
                        TerminalOutcome::NotWinner => {
                            Err("Task terminal state was claimed by another path".to_string())
                        }
                        TerminalOutcome::Completed | TerminalOutcome::Cancelled => Ok(()),
                    };
                    emit_terminal_event(&app_handle_clone, &task_id_event, outcome);
                    completion_result
                } else {
                    Err("Agent task ended without a terminal outcome".to_string())
                };
            let _ = completion_tx.send(completion_result);

            let mut cancel_map = cancel_map_ref.lock().unwrap();
            cancel_map.remove(&task_id_key);
        });

        Ok(task)
    }

    pub async fn cancel_task(state: &AgentServiceState, task_id_str: &str) -> Result<(), String> {
        let handle = {
            let mut cancel_map = state.cancel_txs.lock().unwrap();
            cancel_map.remove(task_id_str)
        };

        let Some(handle) = handle else {
            return Err(format!(
                "Task {} not found or already finished",
                task_id_str
            ));
        };
        let CancellationHandle {
            tx,
            completion_rx,
            requested,
            lifecycle,
        } = handle;

        {
            let mut lifecycle = lifecycle.lock().unwrap();
            if lifecycle.terminal_claimed {
                return Err(format!("Task {} is already finished", task_id_str));
            }
            if lifecycle.cancellation_requested {
                return Err(format!(
                    "Task {} cancellation is already requested",
                    task_id_str
                ));
            }
            lifecycle.cancellation_requested = true;
        }
        requested.store(true, Ordering::SeqCst);

        if let Err(send_error) = tx.send(()) {
            return Err(format!(
                "Task {} cancellation could not be delivered: {:?}",
                task_id_str, send_error
            ));
        }

        completion_rx
            .await
            .map_err(|_| "Agent task cancellation did not complete".to_string())?
    }
}

fn insert_task(state: &AgentServiceState, task: &Task) {
    let mut tasks = state.tasks.lock().unwrap();
    tasks.insert(task.id.0.clone(), task.clone());
}

fn fail_task<R: tauri::Runtime>(
    state: &AgentServiceState,
    task_id: &str,
    task_id_value: &crate::domain::task::TaskId,
    app_handle: &tauri::AppHandle<R>,
    error: String,
) {
    if fail_task_in_map(&state.tasks, task_id, error.clone()) {
        let _ = app_handle.emit(
            AGENT_EVENT_NAME,
            AgentEvent::TaskFailed {
                task_id: task_id_value.clone(),
                error,
            },
        );
    }
}

async fn emit_changed_files<R: tauri::Runtime>(
    tasks: &Arc<Mutex<HashMap<String, Task>>>,
    task_id: &str,
    task_id_value: &crate::domain::task::TaskId,
    app_handle: &tauri::AppHandle<R>,
    lifecycle: &Arc<Mutex<TaskLifecycle>>,
) {
    if is_cancellation_requested(lifecycle) {
        return;
    }

    let worktree_path = {
        let tasks = tasks.lock().unwrap();
        tasks
            .get(task_id)
            .and_then(|task| task.worktree_path.clone())
    };

    let Some(worktree_path) = worktree_path else {
        return;
    };

    let Ok(changed_files) = GitService::get_changed_files(&worktree_path).await else {
        return;
    };

    for file in changed_files {
        if is_cancellation_requested(lifecycle) {
            break;
        }
        let _ = app_handle.emit(
            AGENT_EVENT_NAME,
            AgentEvent::FileChanged {
                task_id: task_id_value.clone(),
                path: file.path,
                status: file.status,
            },
        );
    }
}

fn process_already_stopped(error: &str) -> bool {
    error.contains("Agent process is no longer running")
        || error.contains("Agent process cancellation did not complete")
}

fn is_cancellation_requested(lifecycle: &Arc<Mutex<TaskLifecycle>>) -> bool {
    lifecycle.lock().unwrap().cancellation_requested
}

fn claim_terminal(
    tasks: &Arc<Mutex<HashMap<String, Task>>>,
    lifecycle: &Arc<Mutex<TaskLifecycle>>,
    task_id: &str,
    desired_status: TaskStatus,
    cancellation_wins: bool,
) -> TerminalOutcome {
    let mut lifecycle = lifecycle.lock().unwrap();
    if lifecycle.terminal_claimed {
        return TerminalOutcome::NotWinner;
    }

    let next_status = if cancellation_wins && lifecycle.cancellation_requested {
        TaskStatus::Cancelled
    } else {
        desired_status
    };
    let outcome = terminal_outcome(&next_status);

    let transitioned = {
        let mut tasks = tasks.lock().unwrap();
        tasks
            .get_mut(task_id)
            .map(|task| task.transition_to(next_status).is_ok())
            .unwrap_or(false)
    };

    lifecycle.terminal_claimed = true;
    if transitioned {
        outcome
    } else {
        TerminalOutcome::NotWinner
    }
}

fn terminal_outcome(status: &TaskStatus) -> TerminalOutcome {
    match status {
        TaskStatus::Completed => TerminalOutcome::Completed,
        TaskStatus::Failed(error) => TerminalOutcome::Failed(error.clone()),
        TaskStatus::Cancelled => TerminalOutcome::Cancelled,
        TaskStatus::Created | TaskStatus::Preparing | TaskStatus::Running => {
            TerminalOutcome::NotWinner
        }
    }
}

fn emit_terminal_event<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    task_id: &crate::domain::task::TaskId,
    outcome: TerminalOutcome,
) {
    let event = match outcome {
        TerminalOutcome::Completed => AgentEvent::TaskCompleted {
            task_id: task_id.clone(),
        },
        TerminalOutcome::Failed(error) => AgentEvent::TaskFailed {
            task_id: task_id.clone(),
            error,
        },
        TerminalOutcome::Cancelled => AgentEvent::TaskCancelled {
            task_id: task_id.clone(),
        },
        TerminalOutcome::NotWinner => return,
    };
    let _ = app_handle.emit(AGENT_EVENT_NAME, event);
}

fn fail_task_in_map(
    tasks: &Arc<Mutex<HashMap<String, Task>>>,
    task_id: &str,
    error: String,
) -> bool {
    let mut tasks = tasks.lock().unwrap();
    tasks
        .get_mut(task_id)
        .map(|task| task.transition_to(TaskStatus::Failed(error)).is_ok())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_failed_and_cancelled_lifecycle() {
        let mut failed = Task::new("/tmp/repo".into(), "fail".into(), "mock".into());
        failed.transition_to(TaskStatus::Preparing).unwrap();
        failed
            .transition_to(TaskStatus::Failed("runner failed".into()))
            .unwrap();
        assert_eq!(failed.status, TaskStatus::Failed("runner failed".into()));

        let mut cancelled = Task::new("/tmp/repo".into(), "cancel".into(), "mock".into());
        cancelled.transition_to(TaskStatus::Preparing).unwrap();
        cancelled.transition_to(TaskStatus::Running).unwrap();
        cancelled.transition_to(TaskStatus::Cancelled).unwrap();
        assert_eq!(cancelled.status, TaskStatus::Cancelled);
        assert!(cancelled.transition_to(TaskStatus::Completed).is_err());
    }

    #[test]
    fn test_cancellation_claim_wins_over_completion() {
        let task = Task::new("/tmp/repo".into(), "cancel".into(), "mock".into());
        let task_id = task.id.0.clone();
        let tasks = Arc::new(Mutex::new(HashMap::from([(task_id.clone(), task)])));
        {
            let mut task = tasks.lock().unwrap();
            task.get_mut(&task_id)
                .unwrap()
                .transition_to(TaskStatus::Preparing)
                .unwrap();
            task.get_mut(&task_id)
                .unwrap()
                .transition_to(TaskStatus::Running)
                .unwrap();
        }
        let lifecycle = Arc::new(Mutex::new(TaskLifecycle {
            cancellation_requested: true,
            terminal_claimed: false,
        }));

        let outcome = claim_terminal(&tasks, &lifecycle, &task_id, TaskStatus::Completed, true);

        assert!(matches!(outcome, TerminalOutcome::Cancelled));
        assert_eq!(
            tasks.lock().unwrap().get(&task_id).unwrap().status,
            TaskStatus::Cancelled
        );
        assert!(matches!(
            claim_terminal(&tasks, &lifecycle, &task_id, TaskStatus::Completed, true,),
            TerminalOutcome::NotWinner
        ));
    }
}
