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
	return {
		...state,
		logs: [
			...state.logs,
			{
				id: `log-${state.logs.length + 1}-${Date.now()}`,
				time: new Date().toLocaleTimeString(),
				stream,
				text,
			},
		],
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

// Dynamic module paths prevent Vite from requiring Tauri in browser builds.
const TAURI_CORE_PKG = "@tauri-apps/api/core";
const TAURI_EVENT_PKG = "@tauri-apps/api/event";

type TauriInvoke = <T>(
	command: string,
	args?: Record<string, unknown>,
) => Promise<T>;
type TauriListen = <T>(
	event: string,
	callback: (event: { payload: T }) => void,
) => Promise<() => void>;

async function getTauriInvoke(): Promise<TauriInvoke | null> {
	try {
		if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
			const core = (await import(/* @vite-ignore */ TAURI_CORE_PKG)) as {
				invoke: TauriInvoke;
			};
			return core.invoke;
		}
	} catch {
		return null;
	}
	return null;
}

async function getTauriListen(): Promise<TauriListen | null> {
	try {
		if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
			const event = (await import(/* @vite-ignore */ TAURI_EVENT_PKG)) as {
				listen: TauriListen;
			};
			return event.listen;
		}
	} catch {
		return null;
	}
	return null;
}

export async function selectWorkspace(path: string): Promise<Workspace> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		return invoke<Workspace>("select_workspace", { path });
	}
	return {
		id: `ws-${Date.now()}`,
		path,
		name: path.split("/").pop() || "workspace",
	};
}

export type TaskExecutionMode = "new-worktree" | "existing-worktree";

export async function startAgentTask(
	workspacePath: string,
	prompt: string,
	agentType = "mock",
	executionMode: TaskExecutionMode = "new-worktree",
): Promise<Task> {
	const invoke = await getTauriInvoke();
	if (invoke) {
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

	const taskId = `task-${Math.random().toString(36).substring(2, 9)}`;
	return {
		id: taskId,
		workspace_path: workspacePath,
		worktree_path:
			executionMode === "existing-worktree"
				? workspacePath
				: `${workspacePath}/.my-workbench-worktrees/wt-${taskId}`,
		branch_name:
			executionMode === "existing-worktree"
				? null
				: `my-workbench/wt-${taskId}`,
		status: { state: "Running" },
		prompt,
		agent_type: agentType,
		created_at: new Date().toISOString(),
	};
}

export async function cancelAgentTask(taskId: string): Promise<void> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		return invoke<void>("cancel_agent_task", { taskId });
	}
}

export async function getChangedFiles(
	worktreePath: string,
): Promise<ChangedFile[]> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		return invoke<ChangedFile[]>("get_changed_files", { worktreePath });
	}
	return [
		{ path: "src/lib/tauri-ipc.ts", status: "modified" },
		{ path: "src/routes/agent-slice.tsx", status: "added" },
		{ path: "task_output.txt", status: "untracked" },
	];
}

export async function getDiff(
	worktreePath: string,
	filePath: string,
): Promise<string> {
	const invoke = await getTauriInvoke();
	if (invoke) {
		return invoke<string>("get_diff", { worktreePath, filePath });
	}
	return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,3 +1,5 @@\n+// Added via Agent Execution\n+console.log("Agent finished slice verification");\n`;
}

export async function listenAgentEvents(
	callback: (event: AgentEvent) => void,
): Promise<() => void> {
	const tauriRuntime =
		typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
	if (tauriRuntime) {
		const listen = await getTauriListen();
		if (!listen) {
			throw new Error("Tauri event listener is unavailable");
		}
		const unlisten = await listen<AgentEvent>(
			"my-workbench:agent-event",
			(event) => {
				callback(event.payload);
			},
		);
		return unlisten;
	}

	return () => {};
}
