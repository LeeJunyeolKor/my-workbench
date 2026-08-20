use crate::domain::event::OutputStream;
use std::process::Stdio;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

const MAX_OUTPUT_LINE_BYTES: usize = 16 * 1024;
const OUTPUT_READ_BUFFER_BYTES: usize = 4 * 1024;
const OUTPUT_TRUNCATION_NOTICE: &str = " … [출력이 16 KiB를 초과해 잘렸습니다]";

#[derive(Debug)]
pub enum ProcessOutputMessage {
    Line {
        stream: OutputStream,
        content: String,
    },
    Finished {
        success: bool,
        code: Option<i32>,
    },
    Failed {
        error: String,
    },
    Cancelled,
}

enum RunnerCommand {
    Cancel {
        response: oneshot::Sender<Result<(), String>>,
    },
}

pub struct AgentProcessRunner {
    command_tx: mpsc::Sender<RunnerCommand>,
}

impl AgentProcessRunner {
    pub fn spawn(
        worktree_path: &str,
        agent_type: &str,
        prompt: &str,
    ) -> Result<(Self, mpsc::Receiver<ProcessOutputMessage>), String> {
        let mut command = build_command(worktree_path, agent_type, prompt)?;
        configure_process_group(&mut command);
        configure_stdio(&mut command);

        let child = command
            .spawn()
            .map_err(|error| format!("Failed to spawn {} agent: {}", agent_type, error))?;

        Ok(spawn_child(child))
    }

    pub async fn cancel(&self) -> Result<(), String> {
        let (response_tx, response_rx) = oneshot::channel();
        self.command_tx
            .send(RunnerCommand::Cancel {
                response: response_tx,
            })
            .await
            .map_err(|_| "Agent process is no longer running".to_string())?;
        response_rx
            .await
            .map_err(|_| "Agent process cancellation did not complete".to_string())?
    }
}

fn spawn_child(mut child: Child) -> (AgentProcessRunner, mpsc::Receiver<ProcessOutputMessage>) {
    let (tx, rx) = mpsc::channel(100);
    let (command_tx, mut command_rx) = mpsc::channel(1);

    let stdout_reader = child.stdout.take().map(|stdout| {
        let tx_stdout = tx.clone();
        tokio::spawn(forward_output(stdout, OutputStream::Stdout, tx_stdout))
    });

    let stderr_reader = child.stderr.take().map(|stderr| {
        let tx_stderr = tx.clone();
        tokio::spawn(forward_output(stderr, OutputStream::Stderr, tx_stderr))
    });

    let drain_readers = async move {
        let drain_stdout = async move {
            if let Some(reader) = stdout_reader {
                let _ = reader.await;
            }
        };
        let drain_stderr = async move {
            if let Some(reader) = stderr_reader {
                let _ = reader.await;
            }
        };
        tokio::join!(drain_stdout, drain_stderr);
    };

    let tx_process = tx.clone();
    tokio::spawn(async move {
        let terminal = tokio::select! {
            command = command_rx.recv() => {
                match command {
                    Some(RunnerCommand::Cancel { response }) => {
                        let result = terminate_child(&mut child).await;
                        let message = match &result {
                            Ok(()) => ProcessOutputMessage::Cancelled,
                            Err(error) => ProcessOutputMessage::Failed {
                                error: error.clone(),
                            },
                        };
                        Some((message, Some((response, result))))
                    }
                    None => {
                        let _ = terminate_child(&mut child).await;
                        None
                    }
                }
            }
            result = child.wait() => {
                let message = match result {
                    Ok(status) => ProcessOutputMessage::Finished {
                        success: status.success(),
                        code: status.code(),
                    },
                    Err(error) => ProcessOutputMessage::Failed {
                        error: error.to_string(),
                    },
                };
                Some((message, None))
            }
        };

        // A child can exit before the reader tasks have scheduled their final lines. Wait for
        // both pipes to reach EOF before exposing the terminal message to the consumer.
        drain_readers.await;
        if let Some((message, cancellation)) = terminal {
            let _ = tx_process.send(message).await;
            if let Some((response, result)) = cancellation {
                let _ = response.send(result);
            }
        }
    });

    (AgentProcessRunner { command_tx }, rx)
}

async fn forward_output<R>(
    mut reader: R,
    stream: OutputStream,
    tx: mpsc::Sender<ProcessOutputMessage>,
) where
    R: AsyncRead + Unpin,
{
    let mut read_buffer = [0_u8; OUTPUT_READ_BUFFER_BYTES];
    let mut line = Vec::with_capacity(MAX_OUTPUT_LINE_BYTES);
    let mut discarding_truncated_line = false;

    loop {
        let bytes_read = match reader.read(&mut read_buffer).await {
            Ok(0) => break,
            Ok(bytes_read) => bytes_read,
            Err(_) => return,
        };

        for &byte in &read_buffer[..bytes_read] {
            if discarding_truncated_line {
                if byte == b'\n' {
                    discarding_truncated_line = false;
                }
                continue;
            }

            if byte == b'\n' {
                if line.last() == Some(&b'\r') {
                    line.pop();
                }
                if !send_output_line(&tx, &stream, &line, false).await {
                    return;
                }
                line.clear();
            } else if line.len() < MAX_OUTPUT_LINE_BYTES {
                line.push(byte);
            } else {
                if !send_output_line(&tx, &stream, &line, true).await {
                    return;
                }
                line.clear();
                discarding_truncated_line = true;
            }
        }
    }

    if !discarding_truncated_line && !line.is_empty() {
        let _ = send_output_line(&tx, &stream, &line, false).await;
    }
}

async fn send_output_line(
    tx: &mpsc::Sender<ProcessOutputMessage>,
    stream: &OutputStream,
    line: &[u8],
    truncated: bool,
) -> bool {
    let mut content = String::from_utf8_lossy(line).into_owned();
    if truncated {
        content.push_str(OUTPUT_TRUNCATION_NOTICE);
    }

    tx.send(ProcessOutputMessage::Line {
        stream: stream.clone(),
        content,
    })
    .await
    .is_ok()
}

fn build_command(worktree_path: &str, agent_type: &str, prompt: &str) -> Result<Command, String> {
    match agent_type {
        "codex" => {
            let mut command = Command::new("codex");
            command.arg("exec").arg(prompt);
            command.current_dir(worktree_path);
            Ok(command)
        }
        "claude" => {
            let mut command = Command::new("claude");
            command.arg("-p").arg(prompt);
            command.current_dir(worktree_path);
            Ok(command)
        }
        _ => Err(format!("Unsupported agent type: {}", agent_type)),
    }
}

fn configure_stdio(command: &mut Command) {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
}

async fn terminate_child(child: &mut Child) -> Result<(), String> {
    let group_result = kill_process_group(child.id());
    let kill_result = child.kill().await;
    let wait_result = child.wait().await;

    if let Err(error) = group_result {
        return Err(match (kill_result, wait_result) {
            (Ok(()), Ok(_)) => format!("Failed to kill process group: {}", error),
            (kill, wait) => format!(
                "Failed to kill process group: {} (child kill: {}; wait: {})",
                error,
                format_kill_result(kill),
                format_wait_result(wait),
            ),
        });
    }

    match (kill_result, wait_result) {
        (Ok(()), Ok(_)) => Ok(()),
        (Err(kill_error), Ok(_)) if is_already_finished(&kill_error) => Ok(()),
        (Err(kill_error), Ok(_)) => Err(format!("Failed to kill process: {}", kill_error)),
        (Ok(()), Err(error)) => Err(format!("Process killed but could not be reaped: {}", error)),
        (Err(kill_error), Err(wait_error)) => Err(format!(
            "Failed to cancel process (kill: {}; wait: {})",
            kill_error, wait_error
        )),
    }
}

fn format_kill_result(result: Result<(), std::io::Error>) -> String {
    match result {
        Ok(()) => "ok".to_string(),
        Err(error) => error.to_string(),
    }
}

fn format_wait_result(result: Result<std::process::ExitStatus, std::io::Error>) -> String {
    match result {
        Ok(status) => format!("reaped with {}", status),
        Err(error) => error.to_string(),
    }
}

fn is_already_finished(error: &std::io::Error) -> bool {
    matches!(
        error.kind(),
        std::io::ErrorKind::InvalidInput | std::io::ErrorKind::NotFound
    )
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;

    unsafe {
        command.as_std_mut().pre_exec(|| {
            if libc::setpgid(0, 0) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
}

#[cfg(not(unix))]
fn configure_process_group(_command: &mut Command) {}

#[cfg(unix)]
fn kill_process_group(pid: Option<u32>) -> Result<(), String> {
    let Some(pid) = pid else {
        return Ok(());
    };

    let result = unsafe { libc::kill(-(pid as libc::pid_t), libc::SIGKILL) };
    if result == 0 {
        return Ok(());
    }

    let error = std::io::Error::last_os_error();
    if error.raw_os_error() == Some(libc::ESRCH) {
        Ok(())
    } else {
        Err(error.to_string())
    }
}

#[cfg(not(unix))]
fn kill_process_group(_pid: Option<u32>) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;
    use std::io::Cursor;
    use std::path::Path;

    #[test]
    fn test_builds_real_agent_commands_without_a_shell() {
        let temp_dir = std::env::temp_dir();
        let worktree_str = temp_dir.to_str().unwrap();
        let prompt = "Review changes; echo should-not-run";

        let codex = build_command(worktree_str, "codex", prompt).unwrap();
        assert_eq!(codex.as_std().get_program(), OsStr::new("codex"));
        assert_eq!(
            codex.as_std().get_args().collect::<Vec<_>>(),
            vec![OsStr::new("exec"), OsStr::new(prompt)]
        );
        assert_eq!(
            codex.as_std().get_current_dir(),
            Some(Path::new(worktree_str))
        );

        let claude = build_command(worktree_str, "claude", prompt).unwrap();
        assert_eq!(claude.as_std().get_program(), OsStr::new("claude"));
        assert_eq!(
            claude.as_std().get_args().collect::<Vec<_>>(),
            vec![OsStr::new("-p"), OsStr::new(prompt)]
        );
        assert_eq!(
            claude.as_std().get_current_dir(),
            Some(Path::new(worktree_str))
        );
    }

    #[test]
    fn test_rejects_non_cli_agent_types() {
        for agent_type in ["mock", "slow-mock", "unknown"] {
            let result = build_command("/tmp", agent_type, "prompt");
            assert!(matches!(
                result,
                Err(ref error) if error == &format!("Unsupported agent type: {}", agent_type)
            ));
        }
    }

    #[tokio::test]
    async fn test_truncates_a_long_line_once_and_resumes_after_newline() {
        let mut input = vec![b'x'; MAX_OUTPUT_LINE_BYTES + 8 * 1024];
        input.extend_from_slice(b"\nnext line\n");
        let (tx, mut rx) = mpsc::channel(4);

        forward_output(Cursor::new(input), OutputStream::Stdout, tx).await;

        let mut output = Vec::new();
        while let Some(message) = rx.recv().await {
            output.push(message);
        }
        assert_eq!(output.len(), 2);

        let ProcessOutputMessage::Line { stream, content } = &output[0] else {
            panic!("expected a truncated output line");
        };
        assert_eq!(stream, &OutputStream::Stdout);
        let retained = content
            .strip_suffix(OUTPUT_TRUNCATION_NOTICE)
            .expect("truncation notice must be emitted once");
        assert_eq!(retained.len(), MAX_OUTPUT_LINE_BYTES);
        assert!(retained.bytes().all(|byte| byte == b'x'));
        assert_eq!(content.matches(OUTPUT_TRUNCATION_NOTICE).count(), 1);

        let ProcessOutputMessage::Line { content, .. } = &output[1] else {
            panic!("expected output after the truncated line");
        };
        assert_eq!(content, "next line");
    }

    #[tokio::test]
    async fn test_terminal_message_waits_for_stdout_and_stderr_drain() {
        let temp_dir = std::env::temp_dir();
        let worktree_str = temp_dir.to_str().unwrap();
        let mut command = Command::new("bash");
        command
            .current_dir(worktree_str)
            .arg("-c")
            .arg(
                "i=0; while [ \"$i\" -lt 256 ]; do printf 'stdout-%s\\n' \"$i\"; printf 'stderr-%s\\n' \"$i\" >&2; i=$((i + 1)); done",
            );
        configure_process_group(&mut command);
        configure_stdio(&mut command);
        let child = command.spawn().unwrap();
        let (_runner, mut rx) = spawn_child(child);

        let mut terminal_seen = false;
        let mut output_count = 0;
        while let Some(message) = rx.recv().await {
            match message {
                ProcessOutputMessage::Line { .. } => {
                    assert!(!terminal_seen, "output arrived after the terminal message");
                    output_count += 1;
                }
                ProcessOutputMessage::Finished { success, .. } => {
                    assert!(success);
                    terminal_seen = true;
                }
                ProcessOutputMessage::Failed { error } => {
                    panic!("Process failed: {}", error)
                }
                ProcessOutputMessage::Cancelled => {
                    panic!("Process was cancelled unexpectedly")
                }
            }
        }

        assert!(terminal_seen);
        assert_eq!(output_count, 512);
    }

    #[tokio::test]
    async fn test_cancel_kills_running_process() {
        let temp_dir = std::env::temp_dir();
        let worktree_str = temp_dir.to_str().unwrap();
        let mut command = Command::new("bash");
        command.current_dir(worktree_str).arg("-c").arg("sleep 5");
        configure_process_group(&mut command);
        configure_stdio(&mut command);
        let child = command.spawn().unwrap();
        let (runner, mut rx) = spawn_child(child);

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        runner.cancel().await.unwrap();

        let mut cancelled = false;
        while let Some(msg) = rx.recv().await {
            match msg {
                ProcessOutputMessage::Cancelled => cancelled = true,
                ProcessOutputMessage::Finished { success, .. } => {
                    assert!(!success, "cancelled process must not report success");
                }
                ProcessOutputMessage::Line { .. } | ProcessOutputMessage::Failed { .. } => {}
            }
        }

        assert!(cancelled);
    }
}
