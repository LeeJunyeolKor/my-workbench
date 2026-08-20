import { describe, expect, it } from "vitest";
import { buildOperationsConsoleViewModel } from ".";

const now = new Date("2026-01-02T12:00:00.000Z");

describe("buildOperationsConsoleViewModel", () => {
	it("combines only local tasks and plans", () => {
		const view = buildOperationsConsoleViewModel({
			now,
			tasks: {
				key: "tasks",
				label: "작업",
				status: "ok",
				data: {
					sections: [{ id: "todo", name: "할 일" }],
					tasks: {
						todo: [
							{
								id: "task-1",
								title: "데모 준비",
								note: "핵심 흐름 확인",
								checked: false,
								subtasks: [
									{ text: "구현", checked: true },
									{ text: "검증", checked: false },
								],
								section: "todo",
							},
						],
					},
				},
			},
			plans: {
				key: "plans",
				label: "계획",
				status: "ok",
				data: [
					{
						taskId: "task-1",
						title: "데모 계획",
						progressDone: 2,
						progressTotal: 2,
						modifiedAt: "2026-01-02T11:00:00.000Z",
						accent: "blue",
					},
				],
			},
		});

		expect(view.items.map((item) => item.kind)).toEqual(["task", "plan"]);
		expect(view.items[0]).toMatchObject({
			progress: 50,
			detail: "핵심 흐름 확인",
		});
		expect(view.items[1]).toMatchObject({
			progress: 100,
			status: "완료",
			updated: "1시간 전",
		});
		expect(view.metrics).toEqual([
			expect.objectContaining({ key: "tasks", value: "1" }),
			expect.objectContaining({ key: "plans", value: "1" }),
		]);
	});

	it("reports each unavailable source without hiding the other source", () => {
		const view = buildOperationsConsoleViewModel({
			now,
			tasks: {
				key: "tasks",
				label: "작업",
				status: "unavailable",
				message: "데스크톱 앱에서만 사용할 수 있습니다.",
			},
			plans: {
				key: "plans",
				label: "계획",
				status: "ok",
				data: [],
			},
		});

		expect(view.items).toEqual([]);
		expect(view.sources).toEqual([
			expect.objectContaining({
				key: "tasks",
				status: "unavailable",
				message: "데스크톱 앱에서만 사용할 수 있습니다.",
			}),
			expect.objectContaining({ key: "plans", status: "ok" }),
		]);
		expect(view.metrics).toEqual([
			expect.objectContaining({
				key: "tasks",
				value: "—",
				detail: "데이터를 읽지 못함",
			}),
			expect.objectContaining({ key: "plans", value: "0" }),
		]);
	});
});
