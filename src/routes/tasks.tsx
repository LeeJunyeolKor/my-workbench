import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/layout/AppShell";
import { TaskBoard } from "#/components/tasks/TaskBoard";
import { loadTaskBoardSnapshot } from "#/lib/local-data-ipc";
import { emptyBoard } from "#/lib/tasks/parser";
import {
	DESKTOP_RUNTIME_REQUIRED_MESSAGE,
	hasTauriRuntime,
} from "#/lib/tauri-ipc";

export const Route = createFileRoute("/tasks")({
	loader: async () => {
		if (!hasTauriRuntime()) {
			return {
				board: emptyBoard(),
				content: null,
				readOnlyReason: DESKTOP_RUNTIME_REQUIRED_MESSAGE,
			};
		}
		return await loadTaskBoardSnapshot();
	},
	staleTime: 0,
	gcTime: 0,
	component: TasksPage,
});

function TasksPage() {
	const { board, content, readOnlyReason } = Route.useLoaderData();

	return (
		<AppShell variant="board">
			<TaskBoard
				initialBoard={board}
				initialContent={content}
				readOnlyReason={readOnlyReason}
			/>
		</AppShell>
	);
}
