import type { TaskBoardData } from "#/lib/tasks/types";

export type TaskBoardSave = (
	board: TaskBoardData,
	expectedContent: string | null,
) => Promise<string>;

export function createTaskBoardSaveQueue(
	save: TaskBoardSave,
	initialExpectedContent: string | null,
) {
	let queue = Promise.resolve();
	let expectedContent = initialExpectedContent;

	return (board: TaskBoardData): Promise<void> => {
		const result = queue.then(async () => {
			expectedContent = await save(board, expectedContent);
		});
		queue = result.catch(() => undefined);
		return result;
	};
}
