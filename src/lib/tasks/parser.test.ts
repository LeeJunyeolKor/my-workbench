import { describe, expect, it } from "vitest";
import { taskSectionId } from "#/lib/tasks/columns";
import { parseIssueTitle } from "#/lib/tasks/parse-issue-title";
import {
	addTask,
	deleteTask,
	findUnsupportedTaskMarkdownLine,
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

	it("직렬화한 작업 문법을 손실 없이 다시 읽는다", () => {
		const serialized = tasksToMarkdown(parseTaskMarkdown(SAMPLE));
		const reparsed = parseTaskMarkdown(serialized);

		expect(findUnsupportedTaskMarkdownLine(serialized)).toBeNull();
		expect(reparsed.tasks["in-progress"][0]).toMatchObject({
			title: "DEMO-101 — Example work (↑ DEMO-100)",
			note: "Local note",
			checked: false,
			subtasks: [{ text: "Add a focused test", checked: true }],
		});
	});

	it("파서가 보존할 수 없는 비어 있지 않은 원문 행을 찾는다", () => {
		expect(
			findUnsupportedTaskMarkdownLine(
				"# Tasks\n\n직접 작성한 메모\n\n## Todo\n- [ ] **작업**\n",
			),
		).toBe(3);
	});

	it("굵게 표시 구분자가 제목 안에 들어간 작업을 안전하지 않은 원문으로 판단한다", () => {
		const content = "# Tasks\n\n## Todo\n- [ ] **a ** b**\n";
		expect(findUnsupportedTaskMarkdownLine(content)).toBe(4);
		const board = parseTaskMarkdown("# Tasks\n\n## Todo\n- [ ] **작업**\n");
		board.tasks.todo[0].title = "a ** b";
		expect(() => tasksToMarkdown(board)).toThrow(
			"제목에는 Markdown 굵게 표시 기호(**)를 사용할 수 없습니다.",
		);
	});

	it("비대칭 섹션 굵게 표시는 읽기 전용으로 거절한다", () => {
		for (const heading of [
			"## Todo**",
			"## **Todo",
			"## *Todo",
			"## **Todo**later**",
			"## **Todo** and **Later**",
			"## **To**do**",
		]) {
			const content = `# Tasks\n\n${heading}\n- [ ] **작업**\n`;
			expect(findUnsupportedTaskMarkdownLine(content)).toBe(3);
		}

		const supported = "# Tasks\n\n## **Todo**\n- [ ] **작업**\n";
		expect(findUnsupportedTaskMarkdownLine(supported)).toBeNull();
		expect(parseTaskMarkdown(supported).tasks.todo[0]?.title).toBe("작업");
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
