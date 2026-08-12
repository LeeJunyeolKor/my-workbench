"use server";

import { createServerFn } from "@tanstack/react-start";
import {
	buildOperationsConsoleViewModel,
	type OperationsConsoleSourceKey,
	type OperationsConsoleSourceSnapshot,
	type OperationsConsoleViewModel,
} from "#/lib/operations-console";
import { readConnectors } from "#/server/connectors";
import { readPlanSummaries } from "#/server/plan-read";
import { readTaskBoard } from "#/server/tasks";
import { getWorktreesCached } from "#/server/worktree-cache";

const sourceLabels: Record<OperationsConsoleSourceKey, string> = {
	tasks: "Tasks",
	connectors: "Connectors",
	plans: "Plans",
	worktrees: "Worktrees",
};

export const getOperationsConsoleData = createServerFn({
	method: "GET",
}).handler(async (): Promise<OperationsConsoleViewModel> => {
	const [tasks, connectors, plans, worktrees] = await Promise.all([
		readSource("tasks", readTaskBoard()),
		readSource("connectors", readConnectors()),
		readSource(
			"plans",
			readPlanSummaries().then((result) => result.plans),
		),
		readSource(
			"worktrees",
			getWorktreesCached().then((result) => result.worktrees),
		),
	]);

	return buildOperationsConsoleViewModel({
		now: new Date(),
		tasks,
		connectors,
		plans,
		worktrees,
	});
});

async function readSource<T>(
	key: OperationsConsoleSourceKey,
	promise: Promise<T>,
): Promise<OperationsConsoleSourceSnapshot<T>> {
	try {
		return {
			key,
			label: sourceLabels[key],
			status: "ok",
			data: await promise,
			readAt: new Date().toISOString(),
		};
	} catch (error) {
		return {
			key,
			label: sourceLabels[key],
			status: "unavailable",
			message:
				error instanceof Error
					? error.message
					: "데이터 소스를 읽지 못했습니다.",
			readAt: new Date().toISOString(),
		};
	}
}
