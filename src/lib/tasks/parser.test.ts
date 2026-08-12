import { describe, expect, it } from "vitest";
import { taskSectionId } from "#/lib/tasks/columns";
import { parseIssueTitle } from "#/lib/tasks/parse-issue-title";
import {
	addTask,
	deleteTask,
	moveTask,
	parseTaskMarkdown,
	tasksToMarkdown,
	updateTask,
} from "#/lib/tasks/parser";

const SAMPLE = `# Tasks

## In Progress

- [ ] **DEMO-101 — Example work (↑ DEMO-100)** - Local note
  - [x] Add a focused test

## Todo

- [ ] **Write documentation**
`;

describe("parseTaskMarkdown", () => {
	it("parses local tasks and subtasks", () => {
		const board = parseTaskMarkdown(SAMPLE);
		expect(board.tasks["in-progress"][0]).toMatchObject({
			title: "DEMO-101 — Example work (↑ DEMO-100)",
			note: "Local note",
			subtasks: [{ text: "Add a focused test", checked: true }],
		});
		expect(board.tasks.todo[0].title).toBe("Write documentation");
	});

	it("keeps custom sections before normalized default columns", () => {
		const board = parseTaskMarkdown(
			"# Tasks\n\n## Later Maybe\n\n- [ ] **Try an idea**\n",
		);
		expect(board.sections.map((section) => section.id)).toEqual([
			"later-maybe",
			"in-progress",
			"on-hold",
			"todo",
			"done",
		]);
	});
});

describe("taskSectionId", () => {
	it("maps Korean and English headings to canonical task columns", () => {
		expect(taskSectionId("진행 중")).toBe("in-progress");
		expect(taskSectionId("On Hold")).toBe("on-hold");
		expect(taskSectionId("할 일")).toBe("todo");
		expect(taskSectionId("완료")).toBe("done");
	});
});

describe("parseIssueTitle", () => {
	it("extracts a provider-neutral issue key and parent", () => {
		expect(parseIssueTitle("DEMO-101 — Example work (↑ DEMO-100)")).toEqual({
			issueKey: "DEMO-101",
			summary: "Example work",
			parentKey: "DEMO-100",
		});
	});
});

describe("local board updates", () => {
	it("creates, moves, updates, deletes, and round-trips tasks", () => {
		const parsed = parseTaskMarkdown(SAMPLE);
		const created = {
			id: "task-new",
			title: "DEMO-102 — New task",
			note: "",
			checked: false,
			subtasks: [],
			section: "todo",
		};
		const added = addTask(parsed, created);
		const moved = moveTask(added, created.id, "in-progress");
		const updated = updateTask(moved, {
			...created,
			title: "DEMO-102 — Updated task",
			section: "done",
			checked: true,
		});
		const withoutOriginal = deleteTask(
			updated,
			parsed.tasks["in-progress"][0].id,
		);
		const reparsed = parseTaskMarkdown(tasksToMarkdown(withoutOriginal));

		expect(reparsed.tasks.done).toHaveLength(1);
		expect(reparsed.tasks.done[0]).toMatchObject({
			title: "DEMO-102 — Updated task",
			checked: true,
		});
	});
});
