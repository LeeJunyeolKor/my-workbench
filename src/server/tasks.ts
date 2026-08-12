"use server";

import fs from "node:fs/promises";
import { createServerFn } from "@tanstack/react-start";
import {
	emptyBoard,
	parseTaskMarkdown,
	tasksToMarkdown,
} from "#/lib/tasks/parser";
import type { Task, TaskBoardData } from "#/lib/tasks/types";
import { TASKS_FILE, WORKBENCH_DATA } from "#/server/paths";

type SaveTasksInput = {
	board: TaskBoardData;
};

function assertRecord(data: unknown, message: string): Record<string, unknown> {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new Error(message);
	}
	return data as Record<string, unknown>;
}

function readRequiredString(value: unknown, message: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(message);
	}
	return value.trim();
}

function readOptionalString(value: unknown, message: string): string {
	if (value === undefined || value === null) return "";
	if (typeof value !== "string") throw new Error(message);
	return value.trim();
}

function readBoolean(value: unknown, message: string): boolean {
	if (typeof value !== "boolean") throw new Error(message);
	return value;
}

function parseTaskSubtask(value: unknown): Task["subtasks"][number] {
	const record = assertRecord(
		value,
		"하위 작업 입력 형식이 올바르지 않습니다.",
	);
	return {
		text: readRequiredString(record.text, "하위 작업 제목을 입력해 주세요."),
		checked: readBoolean(
			record.checked,
			"하위 작업 완료 여부 입력 형식이 올바르지 않습니다.",
		),
	};
}

function parseTask(value: unknown): Task {
	const record = assertRecord(value, "작업 입력 형식이 올바르지 않습니다.");
	if (!Array.isArray(record.subtasks)) {
		throw new Error("하위 작업 목록 입력 형식이 올바르지 않습니다.");
	}

	return {
		id: readRequiredString(record.id, "작업 ID를 입력해 주세요."),
		title: readRequiredString(record.title, "작업 제목을 입력해 주세요."),
		note: readOptionalString(
			record.note,
			"작업 메모 입력 형식이 올바르지 않습니다.",
		),
		checked: readBoolean(
			record.checked,
			"작업 완료 여부 입력 형식이 올바르지 않습니다.",
		),
		subtasks: record.subtasks.map(parseTaskSubtask),
		section: readRequiredString(
			record.section,
			"작업 섹션 ID를 입력해 주세요.",
		),
	};
}

function parseTaskSection(value: unknown): TaskBoardData["sections"][number] {
	const record = assertRecord(
		value,
		"작업 섹션 입력 형식이 올바르지 않습니다.",
	);
	return {
		id: readRequiredString(record.id, "작업 섹션 ID를 입력해 주세요."),
		name: readRequiredString(record.name, "작업 섹션 이름을 입력해 주세요."),
	};
}

function parseTaskBoard(value: unknown): TaskBoardData {
	const record = assertRecord(
		value,
		"작업 보드 입력 형식이 올바르지 않습니다.",
	);
	if (!Array.isArray(record.sections)) {
		throw new Error("작업 섹션 목록 입력 형식이 올바르지 않습니다.");
	}
	const tasksRecord = assertRecord(
		record.tasks,
		"작업 목록 입력 형식이 올바르지 않습니다.",
	);

	const sections = record.sections.map(parseTaskSection);
	const tasks: Record<string, Task[]> = {};
	for (const [sectionId, sectionTasks] of Object.entries(tasksRecord)) {
		if (!Array.isArray(sectionTasks)) {
			throw new Error("작업 목록 입력 형식이 올바르지 않습니다.");
		}
		tasks[sectionId.trim()] = sectionTasks.map(parseTask);
	}

	return { sections, tasks };
}

export function parseSaveTasksInput(data: unknown): SaveTasksInput {
	const record = assertRecord(data, "작업 저장 입력 형식이 올바르지 않습니다.");
	return { board: parseTaskBoard(record.board) };
}

async function ensureTasksFile(): Promise<string> {
	await fs.mkdir(WORKBENCH_DATA, { recursive: true });

	try {
		return await fs.readFile(TASKS_FILE, "utf8");
	} catch (error) {
		const code = error instanceof Error && "code" in error ? error.code : null;
		if (code !== "ENOENT") throw error;

		const initial = tasksToMarkdown(emptyBoard());
		await fs.writeFile(TASKS_FILE, initial, "utf8");
		return initial;
	}
}

export async function readTaskBoard(): Promise<TaskBoardData> {
	return parseTaskMarkdown(await ensureTasksFile());
}

export const getTasks = createServerFn({ method: "GET" }).handler(async () => {
	return { board: await readTaskBoard() };
});

export const saveTasks = createServerFn({ method: "POST" })
	.validator(parseSaveTasksInput)
	.handler(async ({ data }) => {
		const content = tasksToMarkdown(data.board);
		await fs.mkdir(WORKBENCH_DATA, { recursive: true });
		await fs.writeFile(TASKS_FILE, content, "utf8");
		return { ok: true as const, content };
	});
