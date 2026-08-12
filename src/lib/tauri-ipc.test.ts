import { describe, expect, it } from "vitest";
import {
	cancelAgentTask,
	getChangedFiles,
	getDiff,
	selectWorkspace,
	startAgentTask,
} from "./tauri-ipc";

describe("Tauri IPC Client Domain Contracts", () => {
	it("selects workspace with path and extracts name", async () => {
		const ws = await selectWorkspace("/Users/test/my-project");
		expect(ws.path).toBe("/Users/test/my-project");
		expect(ws.name).toBe("my-project");
	});

	it("starts agent task with proper initial task status", async () => {
		const task = await startAgentTask("/tmp/repo", "Refactor utils", "mock");
		expect(task.workspace_path).toBe("/tmp/repo");
		expect(task.prompt).toBe("Refactor utils");
		expect(task.agent_type).toBe("mock");
		expect(task.status.state).toBe("Running");
	});

	it("fetches changed files array from worktree", async () => {
		const files = await getChangedFiles("/tmp/worktree");
		expect(Array.isArray(files)).toBe(true);
		expect(files.length).toBeGreaterThan(0);
		expect(files[0]).toHaveProperty("path");
		expect(files[0]).toHaveProperty("status");
	});

	it("fetches diff text for target file", async () => {
		const diff = await getDiff("/tmp/worktree", "src/index.ts");
		expect(typeof diff).toBe("string");
		expect(diff).toContain("+++");
	});

	it("keeps an existing worktree as the execution target in browser fallback", async () => {
		const task = await startAgentTask(
			"/tmp/worktree",
			"Run in selected worktree",
			"mock",
			"existing-worktree",
		);
		expect(task.worktree_path).toBe("/tmp/worktree");
		expect(task.branch_name).toBeNull();
	});

	it("cancels agent task gracefully", async () => {
		await expect(cancelAgentTask("task-123")).resolves.toBeUndefined();
	});
});
