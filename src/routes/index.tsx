import { createFileRoute } from "@tanstack/react-router";
import { OperationsConsolePage } from "#/components/dashboard/OperationsConsolePage";
import { AppShell } from "#/components/layout/AppShell";
import { getErrorMessage } from "#/lib/errors";
import { listPlans, loadTaskBoard } from "#/lib/local-data-ipc";
import {
	buildOperationsConsoleViewModel,
	type OperationsConsoleSourceSnapshot,
} from "#/lib/operations-console";
import type { TaskBoardData } from "#/lib/tasks/types";

export const Route = createFileRoute("/")({
	loader: async () => {
		const [tasks, plans] = await Promise.allSettled([
			loadTaskBoard(),
			listPlans(),
		]);

		return buildOperationsConsoleViewModel({
			tasks: toTaskSnapshot(tasks),
			plans:
				plans.status === "fulfilled"
					? {
							key: "plans",
							label: "계획",
							status: "ok",
							data: plans.value.plans,
						}
					: unavailableSnapshot("plans", "계획", plans.reason),
		});
	},
	pendingMs: 0,
	pendingComponent: OperationsConsolePending,
	component: OperationsConsoleDashboard,
});

function OperationsConsoleDashboard() {
	return <OperationsConsolePage data={Route.useLoaderData()} />;
}

function OperationsConsolePending() {
	return (
		<AppShell>
			<main className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-[#f6f8fa] px-6 text-sm font-medium text-[#57606a] dark:bg-[#0d1117] dark:text-[#8b949e]">
				업무 콘솔을 불러오는 중…
			</main>
		</AppShell>
	);
}

function toTaskSnapshot(
	result: PromiseSettledResult<TaskBoardData>,
): OperationsConsoleSourceSnapshot<TaskBoardData> {
	return result.status === "fulfilled"
		? { key: "tasks", label: "작업", status: "ok", data: result.value }
		: unavailableSnapshot("tasks", "작업", result.reason);
}

function unavailableSnapshot<T>(
	key: "tasks" | "plans",
	label: string,
	error: unknown,
): OperationsConsoleSourceSnapshot<T> {
	return {
		key,
		label,
		status: "unavailable",
		message: getErrorMessage(error, `${label} 데이터를 읽지 못했습니다.`),
	};
}
