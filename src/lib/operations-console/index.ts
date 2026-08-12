import type { ConnectorResult } from "#/lib/connectors/types";
import type { PlanSummary } from "#/lib/plans/types";
import type { TaskBoardData } from "#/lib/tasks/types";
import type { WorktreeInfo } from "#/lib/worktree";

export type OperationsConsoleTone =
	| "neutral"
	| "blue"
	| "amber"
	| "green"
	| "violet"
	| "red";

export type OperationsConsoleKind = "task" | "connector" | "plan" | "worktree";
export type OperationsConsoleSourceKey =
	| "tasks"
	| "connectors"
	| "plans"
	| "worktrees";
export type OperationsConsoleSourceStatus = "ok" | "unavailable";

export type OperationsConsoleSourceSnapshot<T> = {
	key: OperationsConsoleSourceKey;
	label: string;
	status: OperationsConsoleSourceStatus;
	data?: T;
	message?: string;
	readAt?: string;
};

export type OperationsConsoleSourceState = {
	key: OperationsConsoleSourceKey;
	label: string;
	status: OperationsConsoleSourceStatus;
	count: number;
	message?: string;
	readAt?: string;
};

export type OperationsConsoleItem = {
	key: string;
	id: string;
	kind: OperationsConsoleKind;
	repo: string;
	title: string;
	status: string;
	statusTone: OperationsConsoleTone;
	reviewer: string;
	ci: string;
	ciTone: OperationsConsoleTone;
	updated: string;
	source: string;
	target: string;
	risk: string;
	planProgress: number;
	url?: string;
};

export type OperationsConsoleMetric = {
	key: "tasks" | "connectors" | "plans" | "worktrees";
	label: string;
	value: string;
	detail: string;
	tone: OperationsConsoleTone;
};

export type OperationsConsoleViewModel = {
	generatedAt: string;
	items: OperationsConsoleItem[];
	metrics: OperationsConsoleMetric[];
	sources: OperationsConsoleSourceState[];
};

export type OperationsConsoleInput = {
	now?: Date;
	tasks?: OperationsConsoleSourceSnapshot<TaskBoardData>;
	connectors?: OperationsConsoleSourceSnapshot<ConnectorResult[]>;
	plans?: OperationsConsoleSourceSnapshot<PlanSummary[]>;
	worktrees?: OperationsConsoleSourceSnapshot<WorktreeInfo[]>;
};

const sourceDefaults: Record<
	OperationsConsoleSourceKey,
	Pick<OperationsConsoleSourceState, "key" | "label">
> = {
	tasks: { key: "tasks", label: "Tasks" },
	connectors: { key: "connectors", label: "Connectors" },
	plans: { key: "plans", label: "Plans" },
	worktrees: { key: "worktrees", label: "Worktrees" },
};

export function buildOperationsConsoleViewModel(
	input: OperationsConsoleInput,
): OperationsConsoleViewModel {
	const now = input.now ?? new Date();
	const board = input.tasks?.data;
	const tasks = board
		? board.sections.flatMap((section) =>
				(board.tasks[section.id] ?? []).map((task) => ({ task, section })),
			)
		: [];
	const connectors = input.connectors?.data ?? [];
	const connectorItems = connectors.flatMap((connector) =>
		connector.items.map((item) => ({ connector, item })),
	);
	const plans = input.plans?.data ?? [];
	const worktrees = input.worktrees?.data ?? [];
	const items = [
		...tasks.map(({ task, section }) => ({
			key: `task:${task.id}`,
			id: task.id,
			kind: "task" as const,
			repo: "Local board",
			title: task.title,
			status: section.name,
			statusTone: task.checked ? ("green" as const) : ("blue" as const),
			reviewer: "—",
			ci:
				task.subtasks.length > 0
					? `${task.subtasks.filter((subtask) => subtask.checked).length}/${task.subtasks.length}`
					: "—",
			ciTone: "neutral" as const,
			updated: "Local",
			source: "TASKS.md",
			target: section.name,
			risk: task.note ? "Notes" : "None",
			planProgress:
				task.subtasks.length > 0
					? Math.round(
							(task.subtasks.filter((subtask) => subtask.checked).length /
								task.subtasks.length) *
								100,
						)
					: 0,
			url: "/tasks",
		})),
		...connectorItems.map(({ connector, item }) => ({
			key: `connector:${connector.id}:${item.id}`,
			id: item.id,
			kind: "connector" as const,
			repo: item.repository ?? connector.label,
			title: item.title,
			status: item.status,
			statusTone: "violet" as const,
			reviewer: connector.label,
			ci: "—",
			ciTone: "neutral" as const,
			updated: item.updatedAt ? relativeTime(item.updatedAt, now) : "—",
			source: item.branch ?? connector.label,
			target: item.kind,
			risk: "External",
			planProgress: 0,
			url: item.url,
		})),
		...plans.slice(0, 12).map((plan) => ({
			key: `plan:${plan.taskId}`,
			id: plan.taskId,
			kind: "plan" as const,
			repo: plan.repo ?? "Plans",
			title: plan.title,
			status:
				plan.progressTotal > 0 && plan.progressDone === plan.progressTotal
					? "Complete"
					: "In progress",
			statusTone:
				plan.progressTotal > 0 && plan.progressDone === plan.progressTotal
					? ("green" as const)
					: ("violet" as const),
			reviewer: "—",
			ci: `${plan.progressDone}/${plan.progressTotal}`,
			ciTone: "neutral" as const,
			updated: relativeTime(plan.modifiedAt, now),
			source: "Plan",
			target: "Implementation",
			risk: "Local",
			planProgress:
				plan.progressTotal > 0
					? Math.round((plan.progressDone / plan.progressTotal) * 100)
					: 0,
			url: `/plans/${encodeURIComponent(plan.taskId)}`,
		})),
		...worktrees.slice(0, 12).map((worktree) => ({
			key: `worktree:${worktree.path}`,
			id: worktree.issueKey ?? worktree.branch,
			kind: "worktree" as const,
			repo: worktree.repoName,
			title: worktree.issueTitle ?? (worktree.commitMessage || worktree.branch),
			status: worktree.isDirty ? `${worktree.dirtyCount} changed` : "Clean",
			statusTone: worktree.isDirty ? ("amber" as const) : ("green" as const),
			reviewer: "—",
			ci: "—",
			ciTone: "neutral" as const,
			updated: "Local",
			source: worktree.branch,
			target: worktree.type,
			risk: worktree.isDirty ? "Uncommitted" : "None",
			planProgress: worktree.associatedPlan?.progress ?? 0,
			url: "/worktrees",
		})),
	];

	return {
		generatedAt: now.toISOString(),
		items,
		metrics: [
			{
				key: "tasks",
				label: "Tasks",
				value: String(tasks.length),
				detail: "Local board",
				tone: "blue",
			},
			{
				key: "connectors",
				label: "Connectors",
				value: String(connectors.length),
				detail:
					connectorItems.length > 0
						? `${connectorItems.length} external items`
						: "No providers configured",
				tone: "neutral",
			},
			{
				key: "plans",
				label: "Plans",
				value: String(plans.length),
				detail: "Implementation plans",
				tone: "violet",
			},
			{
				key: "worktrees",
				label: "Worktrees",
				value: String(worktrees.length),
				detail: `${worktrees.filter((worktree) => worktree.isDirty).length} with changes`,
				tone: "green",
			},
		],
		sources: [
			toSourceState(input.tasks, tasks.length, "tasks"),
			toSourceState(input.connectors, connectorItems.length, "connectors"),
			toSourceState(input.plans, plans.length, "plans"),
			toSourceState(input.worktrees, worktrees.length, "worktrees"),
		],
	};
}

function toSourceState<T>(
	snapshot: OperationsConsoleSourceSnapshot<T> | undefined,
	count: number,
	key: OperationsConsoleSourceKey,
): OperationsConsoleSourceState {
	return {
		...sourceDefaults[key],
		status: snapshot?.status ?? "unavailable",
		count,
		message: snapshot?.message,
		readAt: snapshot?.readAt,
	};
}

function relativeTime(value: string, now: Date) {
	const milliseconds = now.getTime() - new Date(value).getTime();
	if (!Number.isFinite(milliseconds)) return "—";
	const minutes = Math.max(0, Math.round(milliseconds / 60_000));
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
}
