import { describe, expect, it } from "vitest";
import { buildOperationsConsoleViewModel } from ".";

const now = new Date("2026-01-02T12:00:00.000Z");

describe("buildOperationsConsoleViewModel", () => {
	it("combines local tasks, plans, worktrees, and generic connectors", () => {
		const view = buildOperationsConsoleViewModel({
			now,
			tasks: {
				key: "tasks",
				label: "Tasks",
				status: "ok",
				data: {
					sections: [{ id: "todo", name: "Todo" }],
					tasks: {
						todo: [
							{
								id: "task-1",
								title: "Prepare demo",
								note: "",
								checked: false,
								subtasks: [],
								section: "todo",
							},
						],
					},
				},
			},
			connectors: {
				key: "connectors",
				label: "Connectors",
				status: "ok",
				data: [
					{
						id: "demo",
						label: "Demo provider",
						status: "ok",
						items: [
							{
								id: "DEMO-101",
								kind: "issue",
								title: "Example issue",
								status: "Open",
							},
						],
					},
				],
			},
			plans: {
				key: "plans",
				label: "Plans",
				status: "ok",
				data: [
					{
						taskId: "DEMO-101",
						title: "Example plan",
						progressDone: 1,
						progressTotal: 2,
						modifiedAt: "2026-01-02T11:00:00.000Z",
						accent: "blue",
					},
				],
			},
			worktrees: {
				key: "worktrees",
				label: "Worktrees",
				status: "ok",
				data: [
					{
						path: "/Users/tester/Projects/web-app-worktree",
						commitHash: "0123456789abcdef",
						branch: "feature/demo-101",
						repoName: "web-app",
						repoPath: "/Users/tester/Projects/web-app",
						commitMessage: "Example change",
						isDirty: true,
						dirtyCount: 2,
						type: "developer",
						issueKey: "DEMO-101",
					},
				],
			},
		});

		expect(view.items.map((item) => item.kind)).toEqual([
			"task",
			"connector",
			"plan",
			"worktree",
		]);
		expect(view.metrics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "connectors", value: "1" }),
				expect.objectContaining({ key: "worktrees", value: "1" }),
			]),
		);
	});

	it("reports unavailable sources without failing the console", () => {
		const view = buildOperationsConsoleViewModel({
			now,
			tasks: {
				key: "tasks",
				label: "Tasks",
				status: "unavailable",
				message: "missing file",
			},
		});

		expect(view.items).toEqual([]);
		expect(view.sources.find((source) => source.key === "tasks")).toMatchObject(
			{
				status: "unavailable",
				message: "missing file",
			},
		);
	});
});
