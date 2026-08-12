import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/layout/AppShell";
import { loadTaskBoard, TaskBoard } from "#/components/tasks/TaskBoard";

export const Route = createFileRoute("/tasks")({
	loader: () => loadTaskBoard(),
	staleTime: 0,
	gcTime: 0,
	component: TasksPage,
});

function TasksPage() {
	const { board } = Route.useLoaderData();

	return (
		<AppShell variant="board">
			<TaskBoard initialBoard={board} />
		</AppShell>
	);
}
