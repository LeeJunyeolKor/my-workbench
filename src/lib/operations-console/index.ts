import type { PlanSummary } from "#/lib/plans/types";
import type { TaskBoardData } from "#/lib/tasks/types";

export type OperationsConsoleTone =
	| "neutral"
	| "blue"
	| "green"
	| "violet"
	| "red";

export type OperationsConsoleKind = "task" | "plan";
export type OperationsConsoleSourceKey = "tasks" | "plans";
export type OperationsConsoleSourceStatus = "ok" | "unavailable";

export type OperationsConsoleSourceSnapshot<T> = {
	key: OperationsConsoleSourceKey;
	label: string;
	status: OperationsConsoleSourceStatus;
	data?: T;
	message?: string;
};

export type OperationsConsoleSourceState = {
	key: OperationsConsoleSourceKey;
	label: string;
	status: OperationsConsoleSourceStatus;
	count: number;
	message?: string;
};

export type OperationsConsoleItem = {
	key: string;
	id: string;
	kind: OperationsConsoleKind;
	title: string;
	status: string;
	statusTone: OperationsConsoleTone;
	source: string;
	detail: string;
	updated: string;
	progress: number;
};

export type OperationsConsoleMetric = {
	key: OperationsConsoleSourceKey;
	label: string;
	value: string;
	detail: string;
	tone: OperationsConsoleTone;
};

export type OperationsConsoleViewModel = {
	items: OperationsConsoleItem[];
	metrics: OperationsConsoleMetric[];
	sources: OperationsConsoleSourceState[];
};

export type OperationsConsoleInput = {
	now?: Date;
	tasks?: OperationsConsoleSourceSnapshot<TaskBoardData>;
	plans?: OperationsConsoleSourceSnapshot<PlanSummary[]>;
};

const sourceDefaults = {
	tasks: { key: "tasks", label: "작업" },
	plans: { key: "plans", label: "계획" },
} as const;

export function buildOperationsConsoleViewModel(
	input: OperationsConsoleInput,
): OperationsConsoleViewModel {
	const now = input.now ?? new Date();
	const board = input.tasks?.data;
	const tasks = board
		? board.sections.flatMap((section) =>
				(board.tasks[section.id] ?? []).map((task) => ({ section, task })),
			)
		: [];
	const plans = input.plans?.data ?? [];

	const taskItems = tasks.map(({ section, task }) => {
		const completedSubtasks = task.subtasks.filter(
			(subtask) => subtask.checked,
		).length;
		const progress = task.subtasks.length
			? Math.round((completedSubtasks / task.subtasks.length) * 100)
			: task.checked
				? 100
				: 0;

		return {
			key: `task:${task.id}`,
			id: task.id,
			kind: "task" as const,
			title: task.title,
			status: section.name,
			statusTone: task.checked ? ("green" as const) : ("blue" as const),
			source: "TASKS.md",
			detail:
				task.note ||
				(task.subtasks.length
					? `세부 작업 ${completedSubtasks}/${task.subtasks.length}`
					: "세부 작업 없음"),
			updated: "로컬",
			progress,
		};
	});

	const planItems = plans.map((plan) => {
		const complete =
			plan.progressTotal > 0 && plan.progressDone === plan.progressTotal;
		const progress = plan.progressTotal
			? Math.round((plan.progressDone / plan.progressTotal) * 100)
			: 0;

		return {
			key: `plan:${plan.taskId}`,
			id: plan.taskId,
			kind: "plan" as const,
			title: plan.title,
			status: complete ? "완료" : "진행 중",
			statusTone: complete ? ("green" as const) : ("violet" as const),
			source: plan.repo ?? "로컬 계획",
			detail:
				plan.progressTotal > 0
					? `계획 항목 ${plan.progressDone}/${plan.progressTotal}`
					: "체크할 계획 항목 없음",
			updated: relativeTime(plan.modifiedAt, now),
			progress,
		};
	});

	const openTaskCount = tasks.filter(({ task }) => !task.checked).length;
	const completePlanCount = plans.filter(
		(plan) =>
			plan.progressTotal > 0 && plan.progressDone === plan.progressTotal,
	).length;
	const tasksUnavailable = input.tasks?.status !== "ok";
	const plansUnavailable = input.plans?.status !== "ok";

	return {
		items: [...taskItems, ...planItems],
		metrics: [
			{
				key: "tasks",
				label: "작업",
				value: tasksUnavailable ? "—" : String(tasks.length),
				detail: tasksUnavailable
					? "데이터를 읽지 못함"
					: `${openTaskCount}개 진행 필요`,
				tone: "blue",
			},
			{
				key: "plans",
				label: "구현 계획",
				value: plansUnavailable ? "—" : String(plans.length),
				detail: plansUnavailable
					? "데이터를 읽지 못함"
					: `${completePlanCount}개 완료`,
				tone: "violet",
			},
		],
		sources: [
			toSourceState(input.tasks, tasks.length, "tasks"),
			toSourceState(input.plans, plans.length, "plans"),
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
	};
}

function relativeTime(value: string, now: Date) {
	const milliseconds = now.getTime() - new Date(value).getTime();
	if (!Number.isFinite(milliseconds)) return "—";
	const minutes = Math.max(0, Math.round(milliseconds / 60_000));
	if (minutes < 60) return `${minutes}분 전`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}시간 전`;
	return `${Math.round(hours / 24)}일 전`;
}
