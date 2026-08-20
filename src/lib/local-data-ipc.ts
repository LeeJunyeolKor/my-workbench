import { invoke } from "@tauri-apps/api/core";
import { orderPlanFiles } from "#/lib/plans/order";
import {
	countCheckboxProgress,
	extractTitle,
	extractToc,
	renderPlanHtml,
	summarizePlan,
} from "#/lib/plans/parser";
import type { PlanDetail, PlanFile, PlanSummary } from "#/lib/plans/types";
import {
	emptyBoard,
	findUnsupportedTaskMarkdownLine,
	parseTaskMarkdown,
	tasksToMarkdown,
} from "#/lib/tasks/parser";
import type { TaskBoardData } from "#/lib/tasks/types";
import {
	DESKTOP_RUNTIME_REQUIRED_MESSAGE,
	hasTauriRuntime,
} from "#/lib/tauri-ipc";

type RawTaskBoard = {
	content: string | null;
};

type RawPlan = {
	taskId: string;
	content: string;
	modifiedAtMs: number;
};

type RawPlanList = {
	plansDir: string;
	plans: RawPlan[];
};

type RawPlanFile = {
	filename: string;
	content: string;
	modifiedAtMs: number;
};

type RawPlanDetail = {
	plansDir: string;
	taskId: string;
	files: RawPlanFile[];
};

export type PlanListResult = {
	plansDir: string;
	plans: PlanSummary[];
};

export type TaskBoardSnapshot = {
	board: TaskBoardData;
	content: string | null;
	readOnlyReason: string | null;
};

export type PlanDetailResult = {
	plansDir: string;
	plan: PlanDetail | null;
};

export type SavePlanFileInput = {
	taskId: string;
	filename: string;
	content: string;
	expectedContent: string;
};

function requireDesktopRuntime(): void {
	if (!hasTauriRuntime()) {
		throw new Error(DESKTOP_RUNTIME_REQUIRED_MESSAGE);
	}
}

function toPlanFile(file: RawPlanFile): PlanFile {
	const { done, total } = countCheckboxProgress(file.content);
	return {
		filename: file.filename,
		title: extractTitle(file.content),
		content: file.content,
		html: renderPlanHtml(file.content),
		toc: extractToc(file.content),
		progressDone: done,
		progressTotal: total,
	};
}

export async function loadTaskBoardSnapshot(): Promise<TaskBoardSnapshot> {
	requireDesktopRuntime();
	const result = await invoke<RawTaskBoard>("load_tasks");
	const unsupportedLine =
		result.content === null
			? null
			: findUnsupportedTaskMarkdownLine(result.content);
	return {
		board:
			result.content === null
				? emptyBoard()
				: parseTaskMarkdown(result.content),
		content: result.content,
		readOnlyReason:
			unsupportedLine === null
				? null
				: `TASKS.md ${unsupportedLine}행에 지원하지 않는 문법이 있어 원문 보호를 위해 읽기 전용으로 열었습니다.`,
	};
}

export async function loadTaskBoard(): Promise<TaskBoardData> {
	return (await loadTaskBoardSnapshot()).board;
}

export async function saveTaskBoard(
	board: TaskBoardData,
	expectedContent: string | null,
): Promise<string> {
	requireDesktopRuntime();
	const content = tasksToMarkdown(board);
	await invoke("save_tasks", { content, expectedContent });
	return content;
}

export async function listPlans(): Promise<PlanListResult> {
	requireDesktopRuntime();
	const result = await invoke<RawPlanList>("list_plans");
	const plans = result.plans
		.map((plan) =>
			summarizePlan(plan.taskId, plan.content, new Date(plan.modifiedAtMs)),
		)
		.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
	return { plansDir: result.plansDir, plans };
}

export async function loadPlan(taskId: string): Promise<PlanDetailResult> {
	requireDesktopRuntime();
	const result = await invoke<RawPlanDetail>("load_plan", { taskId });
	if (result.files.length === 0) {
		return { plansDir: result.plansDir, plan: null };
	}

	const orderedRawFiles = orderPlanFiles(result.files);
	const primary =
		orderedRawFiles.find((file) => file.filename === "plan.md") ??
		orderedRawFiles[0];
	const summary = summarizePlan(
		result.taskId,
		primary.content,
		new Date(primary.modifiedAtMs),
	);

	return {
		plansDir: result.plansDir,
		plan: {
			...summary,
			files: orderedRawFiles.map(toPlanFile),
		},
	};
}

export async function savePlanFile(input: SavePlanFileInput): Promise<void> {
	requireDesktopRuntime();
	await invoke("save_plan_file", input);
}
