import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	cancelAgentTask,
	DESKTOP_RUNTIME_REQUIRED_MESSAGE,
	getChangedFiles,
	getDiff,
	listenAgentEvents,
	selectWorkspace,
	startAgentTask,
} from "./tauri-ipc";

const { invokeMock, listenMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

describe("Tauri IPC Client Domain Contracts", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		listenMock.mockReset();
		delete (window as typeof window & { __TAURI_INTERNALS__?: unknown })
			.__TAURI_INTERNALS__;
	});

	const browserCalls: Array<[string, () => Promise<unknown>]> = [
		["workspace selection", () => selectWorkspace("/tmp/repo")],
		["task start", () => startAgentTask("/tmp/repo", "Refactor utils")],
		["task cancellation", () => cancelAgentTask("task-123")],
		["changed files", () => getChangedFiles("/tmp/worktree")],
		["diff", () => getDiff("/tmp/worktree", "src/index.ts")],
		["event subscription", () => listenAgentEvents(() => undefined)],
	];

	it.each(
		browserCalls,
	)("requires the desktop runtime for %s", async (_, call) => {
		await expect(call()).rejects.toThrow(DESKTOP_RUNTIME_REQUIRED_MESSAGE);
	});
});

describe("Tauri IPC wiring", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		listenMock.mockReset();
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
	});

	it("forwards commands and arguments to the desktop runtime", async () => {
		const workspace = {
			id: "workspace-1",
			path: "/tmp/repo",
			name: "repo",
		};
		const task = {
			id: "task-1",
			workspace_path: "/tmp/repo",
			worktree_path: "/tmp/repo",
			branch_name: null,
			status: { state: "Running" as const },
			prompt: "Run checks",
			agent_type: "codex",
			created_at: "2026-08-20T00:00:00.000Z",
		};
		invokeMock.mockResolvedValueOnce(workspace).mockResolvedValueOnce(task);

		await expect(selectWorkspace("/tmp/repo")).resolves.toEqual(workspace);
		await expect(
			startAgentTask("/tmp/repo", "Run checks", "codex", "existing-worktree"),
		).resolves.toEqual(task);

		expect(invokeMock).toHaveBeenNthCalledWith(1, "select_workspace", {
			path: "/tmp/repo",
		});
		expect(invokeMock).toHaveBeenNthCalledWith(2, "start_agent_task", {
			workspacePath: "/tmp/repo",
			prompt: "Run checks",
			agentType: "codex",
			executionMode: "existing-worktree",
		});
	});

	it("forwards desktop events and returns the native cleanup", async () => {
		const cleanup = vi.fn();
		const callback = vi.fn();
		const event = {
			type: "TaskCompleted" as const,
			payload: { task_id: "task-1" },
		};
		listenMock.mockImplementationOnce(
			async (
				_name: string,
				handler: (input: { payload: typeof event }) => void,
			) => {
				handler({ payload: event });
				return cleanup;
			},
		);

		await expect(listenAgentEvents(callback)).resolves.toBe(cleanup);
		expect(listenMock).toHaveBeenCalledWith(
			"my-workbench:agent-event",
			expect.any(Function),
		);
		expect(callback).toHaveBeenCalledWith(event);
	});
});
