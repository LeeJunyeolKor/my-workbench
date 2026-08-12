import { describe, expect, it } from "vitest";
import {
	type AgentEvent,
	createTaskViewState,
	projectTaskState,
	type Task,
} from "./tauri-ipc";

function createTask(id = "task-1"): Task {
	return {
		id,
		workspace_path: "/tmp/repo",
		worktree_path: "/tmp/repo/.my-workbench-worktrees/wt-task-1",
		branch_name: "my-workbench/wt-task-1",
		status: { state: "Running" },
		prompt: "Implement the slice",
		agent_type: "mock",
		created_at: "2026-08-12T00:00:00.000Z",
	};
}

function eventWithTask(
	event: Omit<AgentEvent, "payload"> & {
		payload: Record<string, unknown>;
	},
): AgentEvent {
	return event as AgentEvent;
}

describe("projectTaskState", () => {
	it("projects completion and changed-file events from Rust", () => {
		let state = createTaskViewState(createTask());
		state = projectTaskState(
			state,
			eventWithTask({
				type: "FileChanged",
				payload: {
					task_id: "task-1",
					path: "src/index.ts",
					status: "modified",
				},
			}),
		);
		state = projectTaskState(
			state,
			eventWithTask({
				type: "TaskCompleted",
				payload: { task_id: "task-1" },
			}),
		);

		expect(state.status).toBe("Completed");
		expect(state.task?.status).toEqual({ state: "Completed" });
		expect(state.changedFiles).toEqual([
			{ path: "src/index.ts", status: "modified" },
		]);
		expect(state.logs.at(-1)?.text).toContain("completed");
	});

	it("projects failure details and cancellation as terminal states", () => {
		let failed = createTaskViewState(createTask("task-failed"));
		failed = projectTaskState(
			failed,
			eventWithTask({
				type: "TaskFailed",
				payload: { task_id: "task-failed", error: "command failed" },
			}),
		);

		let cancelled = createTaskViewState(createTask("task-cancelled"));
		cancelled = projectTaskState(
			cancelled,
			eventWithTask({
				type: "TaskCancelled",
				payload: { task_id: "task-cancelled" },
			}),
		);

		expect(failed.status).toBe("Failed");
		expect(failed.error).toBe("command failed");
		expect(cancelled.status).toBe("Cancelled");
		expect(cancelled.task?.status).toEqual({ state: "Cancelled" });
	});

	it("accepts a startup failure before TaskStarted establishes the task id", () => {
		const state = projectTaskState(
			createTaskViewState(),
			eventWithTask({
				type: "TaskFailed",
				payload: { task_id: "task-startup-failed", error: "not a workspace" },
			}),
		);

		expect(state.taskId).toBe("task-startup-failed");
		expect(state.status).toBe("Failed");
		expect(state.error).toBe("not a workspace");
	});

	it("keeps terminal state monotonic when late events arrive", () => {
		let state = createTaskViewState(createTask("task-terminal"));
		state = projectTaskState(
			state,
			eventWithTask({
				type: "TaskCompleted",
				payload: { task_id: "task-terminal" },
			}),
		);
		const terminalState = state;

		state = projectTaskState(
			state,
			eventWithTask({
				type: "Output",
				payload: {
					task_id: "task-terminal",
					stream: "Stdout",
					content: "late output",
				},
			}),
		);
		state = projectTaskState(
			state,
			eventWithTask({
				type: "TaskFailed",
				payload: { task_id: "task-terminal", error: "late failure" },
			}),
		);

		expect(state).toBe(terminalState);
		expect(state.status).toBe("Completed");
	});

	it("ignores events for another task", () => {
		const state = createTaskViewState(createTask("task-current"));
		const next = projectTaskState(
			state,
			eventWithTask({
				type: "TaskCompleted",
				payload: { task_id: "task-other" },
			}),
		);

		expect(next).toBe(state);
	});
});
