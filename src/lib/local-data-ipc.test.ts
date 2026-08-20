import { beforeEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_RUNTIME_REQUIRED_MESSAGE } from "#/lib/tauri-ipc";
import {
	listPlans,
	loadPlan,
	loadTaskBoard,
	loadTaskBoardSnapshot,
	savePlanFile,
	saveTaskBoard,
} from "./local-data-ipc";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("로컬 데이터 IPC", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		delete (window as typeof window & { __TAURI_INTERNALS__?: unknown })
			.__TAURI_INTERNALS__;
	});

	it("데스크톱 런타임 밖에서는 모든 파일 접근을 거부한다", async () => {
		const calls = [
			() => loadTaskBoard(),
			() => loadTaskBoardSnapshot(),
			() => saveTaskBoard({ sections: [], tasks: {} }, null),
			() => listPlans(),
			() => loadPlan("DEMO-1"),
			() =>
				savePlanFile({
					taskId: "DEMO-1",
					filename: "plan.md",
					content: "",
					expectedContent: "old",
				}),
		];

		for (const call of calls) {
			await expect(call()).rejects.toThrow(DESKTOP_RUNTIME_REQUIRED_MESSAGE);
		}
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("TASKS.md 원문을 보드로 읽고 보드를 원문으로 저장한다", async () => {
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
		invokeMock.mockResolvedValueOnce({
			content: "# Tasks\n\n## Todo\n\n- [ ] **DEMO-1 — 첫 작업**\n",
		});

		const board = await loadTaskBoard();
		expect(board.tasks.todo[0]).toMatchObject({
			title: "DEMO-1 — 첫 작업",
			section: "todo",
		});
		expect(invokeMock).toHaveBeenNthCalledWith(1, "load_tasks");

		invokeMock.mockResolvedValueOnce(undefined);
		await expect(saveTaskBoard(board, "원래 원문")).resolves.toContain(
			"**DEMO-1 — 첫 작업**",
		);
		expect(invokeMock).toHaveBeenNthCalledWith(2, "save_tasks", {
			content: expect.stringContaining("**DEMO-1 — 첫 작업**"),
			expectedContent: "원래 원문",
		});
	});

	it("빈 작업 파일 응답은 기본 보드로 변환한다", async () => {
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
		invokeMock.mockResolvedValueOnce({ content: null });

		const board = await loadTaskBoard();
		expect(board.sections.map((section) => section.id)).toEqual([
			"in-progress",
			"on-hold",
			"todo",
			"done",
		]);
	});

	it("지원하지 않는 TASKS.md 원문은 읽기 전용 상태로 표시한다", async () => {
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
		const content = "# Tasks\n\n직접 작성한 메모\n\n## Todo\n- [ ] **작업**\n";
		invokeMock.mockResolvedValueOnce({ content });

		await expect(loadTaskBoardSnapshot()).resolves.toMatchObject({
			content,
			readOnlyReason: expect.stringContaining("3행"),
		});
	});

	it("계획 원문 응답을 목록과 상세 도메인 모델로 변환한다", async () => {
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
		invokeMock.mockResolvedValueOnce({
			plansDir: "/tmp/plans",
			plans: [
				{
					taskId: "DEMO-1",
					content: "# 첫 계획\n\n- [x] 완료\n- [ ] 남음\n",
					modifiedAtMs: Date.parse("2026-08-20T00:00:00Z"),
				},
			],
		});

		await expect(listPlans()).resolves.toEqual({
			plansDir: "/tmp/plans",
			plans: [
				expect.objectContaining({
					taskId: "DEMO-1",
					title: "첫 계획",
					progressDone: 1,
					progressTotal: 2,
				}),
			],
		});

		invokeMock.mockResolvedValueOnce({
			plansDir: "/tmp/plans",
			taskId: "DEMO-1",
			files: [
				{
					filename: "notes.md",
					content: "# 메모\n",
					modifiedAtMs: 2,
				},
				{
					filename: "plan.md",
					content: "# 대표 계획\n\n## 단계\n",
					modifiedAtMs: 1,
				},
			],
		});

		const detail = await loadPlan("DEMO-1");
		expect(detail.plansDir).toBe("/tmp/plans");
		expect(detail.plan).toMatchObject({ taskId: "DEMO-1", title: "대표 계획" });
		expect(detail.plan?.files.map((file) => file.filename)).toEqual([
			"plan.md",
			"notes.md",
		]);
		expect(detail.plan?.files[0]).toMatchObject({
			title: "대표 계획",
			toc: [{ level: 2, text: "단계", id: "단계" }],
		});
		expect(invokeMock).toHaveBeenNthCalledWith(2, "load_plan", {
			taskId: "DEMO-1",
		});
	});

	it("계획 저장 명령과 인자를 그대로 전달한다", async () => {
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
		invokeMock.mockResolvedValueOnce(undefined);
		const input = {
			taskId: "DEMO-1",
			filename: "notes/detail.md",
			content: "# 수정\n",
			expectedContent: "# 기존\n",
		};

		await savePlanFile(input);
		expect(invokeMock).toHaveBeenCalledWith("save_plan_file", input);
	});
});
