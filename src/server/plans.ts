"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import {
	buildPlanWorkContext,
	extractPlanWorkHints,
} from "#/lib/plans/context";
import { orderPlanFiles } from "#/lib/plans/order";
import {
	countCheckboxProgress,
	extractTitle,
	extractToc,
	renderPlanHtml,
	summarizePlan,
} from "#/lib/plans/parser";
import { isValidTaskId, planDirPath } from "#/lib/plans/paths";
import type { PlanDetail } from "#/lib/plans/types";
import {
	getPlansDir,
	normalizePlansDir,
	PLAN_SETTINGS_FILE,
} from "#/server/paths";
import { readPlanFileOrder, savePlanFileOrder } from "#/server/plan-file-order";
import { readPlanSummaries } from "#/server/plan-read";
import { findAgentSessionsForTask } from "./agent-sessions";
import { getConfiguredBranches } from "./branch-links";

type SavePlanFileOrderInput = {
	taskId: string;
	filenames: string[];
};

type SavePlanFileInput = {
	taskId: string;
	filename: string;
	content: string;
};

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	label: string,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout>;
	const timeoutPromise = new Promise<T>((_, reject) => {
		timeout = setTimeout(() => {
			reject(new Error(`${label} 조회 시간이 초과되었습니다.`));
		}, timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]).finally(() =>
		clearTimeout(timeout),
	);
}

export const listPlans = createServerFn({ method: "GET" }).handler(
	readPlanSummaries,
);

function parsePlanSettingsInput(data: unknown): { plansDir: string } {
	if (
		!data ||
		typeof data !== "object" ||
		typeof (data as { plansDir?: unknown }).plansDir !== "string"
	) {
		throw new Error("구현 계획 위치를 입력해 주세요.");
	}
	return { plansDir: (data as { plansDir: string }).plansDir };
}

function assertInputRecord(
	data: unknown,
	message: string,
): Record<string, unknown> {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new Error(message);
	}
	return data as Record<string, unknown>;
}

function parseRequiredString(value: unknown, message: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(message);
	}
	return value.trim();
}

function parsePlanTaskId(value: unknown): string {
	const taskId = parseRequiredString(value, "작업 ID를 입력해 주세요.");
	if (!isValidTaskId(taskId)) {
		throw new Error("올바르지 않은 작업 ID입니다.");
	}
	return taskId;
}

function parsePlanMarkdownFilename(value: unknown): string {
	const filename = parseRequiredString(
		value,
		"구현 계획 파일명을 입력해 주세요.",
	);
	const normalized = path.normalize(filename);
	if (
		path.isAbsolute(normalized) ||
		normalized === ".." ||
		normalized.startsWith(`..${path.sep}`)
	) {
		throw new Error("잘못된 접근 경로입니다 (Path traversal 차단).");
	}
	if (!normalized.endsWith(".md")) {
		throw new Error("마크다운 파일(.md)만 사용할 수 있습니다.");
	}
	return normalized;
}

function parsePlanMarkdownFilenames(value: unknown): string[] {
	if (!Array.isArray(value)) {
		throw new Error("구현 계획 파일 목록 입력 형식이 올바르지 않습니다.");
	}
	return value.map(parsePlanMarkdownFilename);
}

function parsePlanFileContent(value: unknown): string {
	if (typeof value !== "string") {
		throw new Error("구현 계획 파일 내용 입력 형식이 올바르지 않습니다.");
	}
	return value;
}

export function parseSavePlanFileOrderInput(
	data: unknown,
): SavePlanFileOrderInput {
	const record = assertInputRecord(
		data,
		"구현 계획 파일 정렬 입력 형식이 올바르지 않습니다.",
	);

	return {
		taskId: parsePlanTaskId(record.taskId),
		filenames: parsePlanMarkdownFilenames(record.filenames),
	};
}

export function parseSavePlanFileInput(data: unknown): SavePlanFileInput {
	const record = assertInputRecord(
		data,
		"구현 계획 파일 저장 입력 형식이 올바르지 않습니다.",
	);

	return {
		taskId: parsePlanTaskId(record.taskId),
		filename: parsePlanMarkdownFilename(record.filename),
		content: parsePlanFileContent(record.content),
	};
}

export const savePlanSettings = createServerFn({ method: "POST" })
	.inputValidator(parsePlanSettingsInput)
	.handler(async ({ data }) => {
		const plansDir = normalizePlansDir(data.plansDir);
		await fs.mkdir(path.dirname(PLAN_SETTINGS_FILE), { recursive: true });
		await fs.writeFile(
			PLAN_SETTINGS_FILE,
			`${JSON.stringify({ plansDir }, null, 2)}\n`,
			"utf8",
		);
		return { plansDir };
	});

export const getPlanSettings = createServerFn({ method: "GET" }).handler(
	async () => ({ plansDir: getPlansDir() }),
);

async function getMarkdownFilesRecursive(
	dir: string,
	baseDir: string = dir,
): Promise<{ filename: string; fullPath: string }[]> {
	const results: { filename: string; fullPath: string }[] = [];
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const resPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.startsWith(".")) continue;
				const subFiles = await getMarkdownFilesRecursive(resPath, baseDir);
				results.push(...subFiles);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				const relativePath = path.relative(baseDir, resPath);
				results.push({
					filename: relativePath,
					fullPath: resPath,
				});
			}
		}
	} catch (err) {
		console.error("Failed to read directory recursively", dir, err);
	}
	return results;
}

export const getPlan = createServerFn({ method: "GET" })
	.inputValidator((data: { taskId: string }) => data)
	.handler(async ({ data }): Promise<PlanDetail | null> => {
		const dirPath = planDirPath(data.taskId);
		if (!dirPath) return null;

		try {
			const mdFiles = await getMarkdownFilesRecursive(dirPath);
			if (mdFiles.length === 0) return null;

			const filesData = await Promise.all(
				mdFiles.map(async ({ filename, fullPath }) => {
					const content = await fs.readFile(fullPath, "utf8");
					const stat = await fs.stat(fullPath);

					const { done, total } = countCheckboxProgress(content);
					const title = extractTitle(content);
					const html = renderPlanHtml(content);
					const toc = extractToc(content);

					return {
						filename,
						title,
						content,
						html,
						toc,
						progressDone: done,
						progressTotal: total,
						mtime: stat.mtime,
					};
				}),
			);

			const savedOrder = await readPlanFileOrder(data.taskId);
			const orderedFilesData = orderPlanFiles(filesData, savedOrder);
			const workHints = extractPlanWorkHints(
				orderedFilesData.map(({ filename, content }) => ({
					filename,
					content,
				})),
			);

			// 대표 메타데이터 수집 (기본 plan.md 기준, 없으면 첫번째 파일 기준)
			const primaryFile =
				orderedFilesData.find((f) => f.filename === "plan.md") ||
				orderedFilesData[0];
			const primaryContent = primaryFile.content;

			const summary = summarizePlan(
				data.taskId,
				primaryContent,
				primaryFile.mtime,
			);

			let workContext = buildPlanWorkContext({
				taskKey: data.taskId,
				workHints,
			});
			try {
				const { getWorktreesCached } = await import("./worktree-cache");
				const [worktreesResult, branchesResult] = await Promise.allSettled([
					withTimeout(getWorktreesCached(), 2500, "워크트리"),
					withTimeout(getConfiguredBranches(), 2500, "브랜치"),
				]);
				const worktrees =
					worktreesResult.status === "fulfilled"
						? worktreesResult.value.worktrees
						: [];
				const branches =
					branchesResult.status === "fulfilled" ? branchesResult.value : [];
				const preliminaryContext = buildPlanWorkContext({
					taskKey: data.taskId,
					workHints,
					worktrees,
					branches,
				});
				const agentSessions = await withTimeout(
					findAgentSessionsForTask({
						taskKey: data.taskId,
						taskAliases: workHints.taskKeys,
						branches: Array.from(
							new Set([
								...preliminaryContext.relatedBranches.map(
									(branch) => branch.normalizedBranch,
								),
								...workHints.branches,
							]),
						),
						reviews: [],
						repoPaths: Array.from(
							new Set([
								...preliminaryContext.relatedBranches
									.map((branch) => branch.repoPath)
									.filter(Boolean),
								...preliminaryContext.relatedWorktrees
									.map((worktree) => worktree.repoPath)
									.filter(Boolean),
								...workHints.repoPaths,
							]),
						),
						commitHashes: preliminaryContext.relatedWorktrees.map(
							(worktree) => worktree.commitHash,
						),
						keywords: summary.title
							? [summary.title, ...workHints.taskKeys]
							: workHints.taskKeys,
					}),
					2500,
					"에이전트 세션",
				).catch(() => []);

				workContext = buildPlanWorkContext({
					taskKey: data.taskId,
					workHints,
					worktrees,
					branches,
					agentSessions,
				});
			} catch (err) {
				console.error("Failed to get plan work context", data.taskId, err);
			}

			return {
				taskId: data.taskId,
				title: summary.title,
				modifiedAt: summary.modifiedAt,
				accent: summary.accent,
				repo: summary.repo,
				issueUrl: summary.issueUrl,
				files: orderedFilesData.map(
					({
						filename,
						title,
						content,
						html,
						toc,
						progressDone,
						progressTotal,
					}) => ({
						filename,
						title,
						content,
						html,
						toc,
						progressDone,
						progressTotal,
					}),
				),
				worktrees: workContext.relatedWorktrees,
				branches: workContext.relatedBranches,
				agentSessions: workContext.relatedAgentSessions,
			};
		} catch (e) {
			console.error("Failed to getPlan for", data.taskId, e);
			return null;
		}
	});

export const savePlanFileOrderFn = createServerFn({ method: "POST" })
	.inputValidator(parseSavePlanFileOrderInput)
	.handler(async ({ data }) => {
		const dirPath = planDirPath(data.taskId);
		if (!dirPath) throw new Error("구현 계획 디렉토리를 찾을 수 없습니다.");

		for (const filename of data.filenames) {
			const targetPath = path.join(dirPath, filename);
			const relative = path.relative(dirPath, targetPath);
			if (relative.startsWith("..") || path.isAbsolute(relative)) {
				throw new Error("잘못된 접근 경로입니다 (Path traversal 차단).");
			}
			if (!filename.endsWith(".md")) {
				throw new Error("마크다운 파일(.md)만 정렬할 수 있습니다.");
			}
		}

		await savePlanFileOrder(data.taskId, data.filenames);
		return { ok: true as const };
	});

export const savePlanFileFn = createServerFn({ method: "POST" })
	.inputValidator(parseSavePlanFileInput)
	.handler(async ({ data }) => {
		const dirPath = planDirPath(data.taskId);
		if (!dirPath) throw new Error("구현 계획 디렉토리를 찾을 수 없습니다.");

		const targetPath = path.join(dirPath, data.filename);
		const relative = path.relative(dirPath, targetPath);

		if (relative.startsWith("..") || path.isAbsolute(relative)) {
			throw new Error("잘못된 접근 경로입니다 (Path traversal 차단).");
		}
		if (!data.filename.endsWith(".md")) {
			throw new Error("마크다운 파일(.md)만 편집이 가능합니다.");
		}

		await fs.writeFile(targetPath, data.content, "utf8");
		return { success: true };
	});
