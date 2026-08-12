import { describe, expect, it } from "vitest";
import { parseSaveTasksInput } from "./tasks";

const board = {
	sections: [{ id: " todo ", name: " 할 일 " }],
	tasks: {
		todo: [
			{
				id: " task-1 ",
				title: " DEMO-101 — 예시 작업 ",
				note: " 로컬 메모 ",
				checked: false,
				subtasks: [{ text: " 테스트 확인 ", checked: true }],
				section: " todo ",
			},
		],
	},
};

describe("parseSaveTasksInput", () => {
	it("normalizes safe local board input", () => {
		expect(parseSaveTasksInput({ board })).toEqual({
			board: {
				sections: [{ id: "todo", name: "할 일" }],
				tasks: {
					todo: [
						{
							id: "task-1",
							title: "DEMO-101 — 예시 작업",
							note: "로컬 메모",
							checked: false,
							subtasks: [{ text: "테스트 확인", checked: true }],
							section: "todo",
						},
					],
				},
			},
		});
	});

	it("rejects malformed task board sections", () => {
		expect(() =>
			parseSaveTasksInput({
				board: { sections: [{ id: "", name: "할 일" }], tasks: {} },
			}),
		).toThrow("작업 섹션 ID를 입력해 주세요.");
	});
});
