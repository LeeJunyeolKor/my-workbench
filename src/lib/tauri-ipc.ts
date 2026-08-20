import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * High-level Tauri IPC API client for the My Workbench agent workspace.
 *
 * Rust owns task state. The renderer only projects the event stream into a
 * view state and uses commands for explicit queries such as changed files and
 * diffs.
 */

export type TaskIdWire = string | { 0: string };

export function normalizeTaskId(id: TaskIdWire): string {
	return typeof id === "string" ? id : id[0];
}

export interface Workspace {
	id: TaskIdWire;
	path: string;
	name: string;
}

export type AgentType = "codex" | "claude";

export type TaskState =
	| "Created"
	| "Preparing"
	| "Running"
	| "Completed"
	| "Failed"
	| "Cancelled";

export function isTerminalTaskState(status: TaskState | null): boolean {
	return (
		status === "Completed" || status === "Failed" || status === "Cancelled"
	);
}

export type TaskStatus =
	| { state: "Created" }
	| { state: "Preparing" }
	| { state: "Running" }
	| { state: "Completed" }
	| { state: "Failed"; details: string }
	| { state: "Cancelled" };

export interface Task {
	id: TaskIdWire;
	workspace_path: string;
	worktree_path?: string | null;
	branch_name?: string | null;
	status: TaskStatus;
	prompt: string;
	agent_type: string;
	created_at: string;
}

export type ChangeStatus =
	| "modified"
	| "added"
	| "deleted"
	| "renamed"
	| "untracked";

export interface ChangedFile {
	path: string;
	status: ChangeStatus;
}

export type AgentEvent =
	| {
			type: "TaskStarted";
			payload: { task_id: TaskIdWire; worktree_path: string };
	  }
	| {
			type: "Output";
			payload: {
				task_id: TaskIdWire;
				stream: "Stdout" | "Stderr";
				content: string;
			};
	  }
	| {
			type: "FileChanged";
			payload: {
				task_id: TaskIdWire;
				path: string;
				status: ChangeStatus;
			};
	  }
	| {
			type: "Progress";
			payload: { task_id: TaskIdWire; message: string };
	  }
	| { type: "TaskCompleted"; payload: { task_id: TaskIdWire } }
	| { type: "TaskFailed"; payload: { task_id: TaskIdWire; error: string } }
	| { type: "TaskCancelled"; payload: { task_id: TaskIdWire } };

export type TaskLogStream = "stdout" | "stderr" | "system";

export interface TaskLogEntry {
	id: string;
	time: string;
	stream: TaskLogStream;
	text: string;
}

export interface TaskViewState {
	task: Task | null;
	taskId: string | null;
	status: TaskState | null;
	statusDetails: string | null;
	worktreePath: string | null;
	branchName: string | null;
	logs: TaskLogEntry[];
	changedFiles: ChangedFile[];
	error: string | null;
}

const MAX_TASK_LOGS = 500;
let nextTaskLogId = 1;

export function appendTaskLog(
	logs: TaskLogEntry[],
	log: TaskLogEntry,
): TaskLogEntry[] {
	return [...logs.slice(-(MAX_TASK_LOGS - 1)), log];
}

export function taskStatusFromViewState(
	state: TaskViewState,
): TaskStatus | null {
	switch (state.status) {
		case "Created":
			return { state: "Created" };
		case "Preparing":
			return { state: "Preparing" };
		case "Running":
			return { state: "Running" };
		case "Completed":
			return { state: "Completed" };
		case "Failed":
			return {
				state: "Failed",
				details: state.statusDetails ?? state.error ?? "",
			};
		case "Cancelled":
			return { state: "Cancelled" };
		default:
			return null;
	}
}

export function createTaskViewState(task: Task | null = null): TaskViewState {
	const taskId = task ? normalizeTaskId(task.id) : null;
	const failedDetails =
		task?.status.state === "Failed" ? task.status.details : null;
	return {
		task,
		taskId,
		status: task?.status.state ?? null,
		statusDetails: failedDetails,
		worktreePath: task?.worktree_path ?? null,
		branchName: task?.branch_name ?? null,
		logs: [],
		changedFiles: [],
		error: failedDetails,
	};
}

function appendLog(
	state: TaskViewState,
	stream: TaskLogStream,
	text: string,
): TaskViewState {
	const log: TaskLogEntry = {
		id: `log-${nextTaskLogId++}`,
		time: new Date().toLocaleTimeString(),
		stream,
		text,
	};
	return {
		...state,
		logs: appendTaskLog(state.logs, log),
	};
}

function withTaskStatus(
	state: TaskViewState,
	status: TaskStatus,
): TaskViewState {
	return {
		...state,
		task: state.task ? { ...state.task, status } : state.task,
		status: status.state,
		statusDetails: status.state === "Failed" ? status.details : null,
		error: status.state === "Failed" ? status.details : null,
	};
}

/** Project one Rust AgentEvent into the renderer's task view state. */
export function projectTaskState(
	state: TaskViewState,
	event: AgentEvent,
): TaskViewState {
	const eventTaskId = normalizeTaskId(event.payload.task_id);

	// A normal stream starts with TaskStarted. Startup failures can happen before
	// that event, so terminal failure/cancellation events are also allowed to
	// establish the task identity and remain visible in the panel.
	if (
		!state.taskId &&
		event.type !== "TaskStarted" &&
		event.type !== "TaskFailed" &&
		event.type !== "TaskCancelled"
	) {
		return state;
	}
	if (state.taskId && state.taskId !== eventTaskId) return state;

	// Terminal state is monotonic. Late output, progress, file, or even duplicate
	// terminal events must not regress or append to a completed task.
	if (isTerminalTaskState(state.status)) return state;

	const baseState = { ...state, taskId: eventTaskId };

	switch (event.type) {
		case "TaskStarted": {
			const next = withTaskStatus(baseState, { state: "Running" });
			return appendLog(
				{
					...next,
					worktreePath: event.payload.worktree_path,
				},
				"system",
				`Task started in ${event.payload.worktree_path}`,
			);
		}
		case "Output":
			return appendLog(
				baseState,
				event.payload.stream === "Stderr" ? "stderr" : "stdout",
				event.payload.content,
			);
		case "Progress":
			return appendLog(baseState, "system", event.payload.message);
		case "FileChanged": {
			const changedFile: ChangedFile = {
				path: event.payload.path,
				status: event.payload.status,
			};
			const changedFiles = baseState.changedFiles.some(
				(file) => file.path === changedFile.path,
			)
				? baseState.changedFiles.map((file) =>
						file.path === changedFile.path ? changedFile : file,
					)
				: [...baseState.changedFiles, changedFile];
			return { ...baseState, changedFiles };
		}
		case "TaskCompleted":
			return appendLog(
				withTaskStatus(baseState, { state: "Completed" }),
				"system",
				"Task completed successfully",
			);
		case "TaskFailed":
			return appendLog(
				withTaskStatus(baseState, {
					state: "Failed",
					details: event.payload.error,
				}),
				"stderr",
				`Task failed: ${event.payload.error}`,
			);
		case "TaskCancelled":
			return appendLog(
				withTaskStatus(baseState, { state: "Cancelled" }),
				"system",
				"Task cancelled by user",
			);
	}
}

export const DESKTOP_RUNTIME_REQUIRED_MESSAGE =
	"이 기능은 My Workbench 데스크톱 앱에서만 사용할 수 있습니다.";

export function hasTauriRuntime(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
function requireTauriRuntime(): void {
	if (!hasTauriRuntime()) {
		throw new Error(DESKTOP_RUNTIME_REQUIRED_MESSAGE);
	}
}

export async function selectWorkspace(path: string): Promise<Workspace> {
	requireTauriRuntime();
	return invoke<Workspace>("select_workspace", { path });
}

export type TaskExecutionMode = "new-worktree" | "existing-worktree";

export async function startAgentTask(
	workspacePath: string,
	prompt: string,
	agentType: AgentType = "codex",
	executionMode: TaskExecutionMode = "new-worktree",
): Promise<Task> {
	requireTauriRuntime();
	const args: Record<string, unknown> = {
		workspacePath,
		prompt,
		agentType,
	};
	if (executionMode !== "new-worktree") {
		args.executionMode = executionMode;
	}
	return invoke<Task>("start_agent_task", args);
}

export async function cancelAgentTask(taskId: string): Promise<void> {
	requireTauriRuntime();
	return invoke<void>("cancel_agent_task", { taskId });
}

export async function getChangedFiles(
	worktreePath: string,
): Promise<ChangedFile[]> {
	requireTauriRuntime();
	return invoke<ChangedFile[]>("get_changed_files", { worktreePath });
}

export async function getDiff(
	worktreePath: string,
	filePath: string,
): Promise<string> {
	requireTauriRuntime();
	return invoke<string>("get_diff", { worktreePath, filePath });
}

export async function listenAgentEvents(
	callback: (event: AgentEvent) => void,
): Promise<() => void> {
	requireTauriRuntime();
	return listen<AgentEvent>("my-workbench:agent-event", (event) => {
		callback(event.payload);
	});
}
