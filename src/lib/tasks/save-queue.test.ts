import { describe, expect, it, vi } from "vitest";
import { emptyBoard } from "#/lib/tasks/parser";
import { createTaskBoardSaveQueue } from "./save-queue";

describe("작업 보드 저장 큐", () => {
	it("앞선 저장이 끝난 뒤 다음 변경을 순서대로 저장한다", async () => {
		let finishFirst: ((content: string) => void) | undefined;
		const save = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						finishFirst = resolve;
					}),
			)
			.mockResolvedValueOnce("두 번째 직렬화 원문");
		const enqueue = createTaskBoardSaveQueue(save, "처음 읽은 원문");
		const firstBoard = emptyBoard();
		const secondBoard = {
			...emptyBoard(),
			tasks: {
				...emptyBoard().tasks,
				todo: [
					{
						id: "task-2",
						title: "두 번째 변경",
						note: "",
						checked: false,
						subtasks: [],
						section: "todo",
					},
				],
			},
		};

		const first = enqueue(firstBoard);
		const second = enqueue(secondBoard);
		await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
		expect(save).toHaveBeenNthCalledWith(1, firstBoard, "처음 읽은 원문");

		finishFirst?.("첫 번째 직렬화 원문");
		await Promise.all([first, second]);
		expect(save).toHaveBeenNthCalledWith(2, secondBoard, "첫 번째 직렬화 원문");
	});

	it("실패한 저장 뒤에도 다음 변경을 계속 저장한다", async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error("disk full"))
			.mockResolvedValueOnce("저장된 원문");
		const enqueue = createTaskBoardSaveQueue(save, "처음 읽은 원문");
		const board = emptyBoard();

		await expect(enqueue(board)).rejects.toThrow("disk full");
		await expect(enqueue(board)).resolves.toBeUndefined();
		expect(save).toHaveBeenCalledTimes(2);
		expect(save).toHaveBeenNthCalledWith(2, board, "처음 읽은 원문");
	});
});
