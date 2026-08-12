"use server";

import fs from "node:fs/promises";
import { createServerFn } from "@tanstack/react-start";
import { summarizePlan } from "#/lib/plans/parser";
import { planDirPath, planFilePath } from "#/lib/plans/paths";
import type { PlanSummary } from "#/lib/plans/types";
import { parseTaskMarkdown } from "#/lib/tasks/parser";
import type { Task } from "#/lib/tasks/types";
import type { WorktreeInfo } from "#/lib/worktree";
import { getPlansDir, TASKS_FILE } from "#/server/paths";
import { getWorktreesImpl } from "./worktree-impl";

export type SearchResult = {
	type: "worktree" | "plan" | "task";
	id: string;
	title: string;
	subtitle: string;
	url: string;
};

async function readPlanSummary(taskId: string): Promise<PlanSummary | null> {
	const filePath = planFilePath(taskId);
	if (!filePath) return null;

	try {
		const [content, stat] = await Promise.all([
			fs.readFile(filePath, "utf8"),
			fs.stat(filePath),
		]);
		return summarizePlan(taskId, content, stat.mtime);
	} catch {
		return null;
	}
}

// 인메모리 캐시 구조 및 상태
interface SearchCache {
	worktrees: WorktreeInfo[] | null;
	plans: PlanSummary[] | null;
	tasks: Task[] | null;
	lastUpdated: number;
}

let searchCache: SearchCache = {
	worktrees: null,
	plans: null,
	tasks: null,
	lastUpdated: 0,
};

const CACHE_TTL_MS = 5000; // 5초 캐시 유지

// 데이터를 동시에 로드하여 캐시 갱신
async function refreshCacheIfNeeded(): Promise<SearchCache> {
	const now = Date.now();
	if (
		searchCache.worktrees &&
		searchCache.plans &&
		searchCache.tasks &&
		now - searchCache.lastUpdated < CACHE_TTL_MS
	) {
		return searchCache;
	}

	// 1. Worktrees 병렬 수집 구현
	const fetchWorktrees = async (): Promise<WorktreeInfo[]> => {
		try {
			const { worktrees } = await getWorktreesImpl();
			return worktrees || [];
		} catch (err) {
			console.error("Cache refresh: worktrees failed:", err);
			return searchCache.worktrees || []; // 실패 시 이전 캐시 보존
		}
	};

	// 2. Plans 병렬 수집 구현
	const fetchPlans = async (): Promise<PlanSummary[]> => {
		try {
			const plansDir = getPlansDir();
			let entries: string[] = [];
			try {
				entries = await fs.readdir(plansDir);
			} catch {
				return [];
			}

			const summaries = await Promise.all(
				entries.map(async (entry) => {
					const dir = planDirPath(entry);
					if (!dir) return null;
					try {
						const stat = await fs.stat(dir);
						if (!stat.isDirectory()) return null;
					} catch {
						return null;
					}
					return readPlanSummary(entry);
				}),
			);
			return summaries.filter((plan): plan is PlanSummary => plan !== null);
		} catch (err) {
			console.error("Cache refresh: plans failed:", err);
			return searchCache.plans || [];
		}
	};

	// 3. Tasks 병렬 수집 구현
	const fetchTasks = async (): Promise<Task[]> => {
		try {
			let content = "";
			try {
				content = await fs.readFile(TASKS_FILE, "utf8");
			} catch {
				return [];
			}

			if (!content) return [];
			const board = parseTaskMarkdown(content);
			if (!board || !board.tasks) return [];

			const allTasks: Task[] = [];
			for (const sectionId of Object.keys(board.tasks)) {
				const tasks = board.tasks[sectionId] || [];
				for (const task of tasks) {
					allTasks.push(task);
				}
			}
			return allTasks;
		} catch (err) {
			console.error("Cache refresh: tasks failed:", err);
			return searchCache.tasks || [];
		}
	};

	// 병렬 실행으로 디스크 IO 합산 지연 최소화
	const [worktrees, plans, tasks] = await Promise.all([
		fetchWorktrees(),
		fetchPlans(),
		fetchTasks(),
	]);

	searchCache = {
		worktrees,
		plans,
		tasks,
		lastUpdated: now,
	};

	return searchCache;
}

export const globalSearch = createServerFn({ method: "POST" })
	.inputValidator((data: { query: string }) => data)
	.handler(async ({ data }): Promise<SearchResult[]> => {
		const query = (data.query || "").trim().toLowerCase();
		if (!query) return [];

		// 캐시 확인 및 병렬 업데이트
		const cache = await refreshCacheIfNeeded();
		const results: SearchResult[] = [];

		// 1. 캐시된 Worktrees 매칭
		if (cache.worktrees) {
			for (const wt of cache.worktrees) {
				if (
					wt.branch.toLowerCase().includes(query) ||
					wt.repoName.toLowerCase().includes(query) ||
					wt.path.toLowerCase().includes(query)
				) {
					results.push({
						type: "worktree",
						id: wt.path,
						title: wt.branch,
						subtitle: `Worktree: ${wt.repoName} (${wt.path})`,
						url: "/worktrees",
					});
				}
			}
		}

		// 2. 캐시된 Plans 매칭
		if (cache.plans) {
			for (const plan of cache.plans) {
				if (
					plan.taskId.toLowerCase().includes(query) ||
					plan.title.toLowerCase().includes(query) ||
					plan.repo?.toLowerCase().includes(query)
				) {
					results.push({
						type: "plan",
						id: plan.taskId,
						title: plan.title,
						subtitle: `Plan: ${plan.taskId}${plan.repo ? ` [${plan.repo}]` : ""}`,
						url: `/plans/${plan.taskId}`,
					});
				}
			}
		}

		// 3. 캐시된 Tasks 매칭
		if (cache.tasks) {
			for (const task of cache.tasks) {
				if (
					task.id.toLowerCase().includes(query) ||
					task.title.toLowerCase().includes(query) ||
					task.note.toLowerCase().includes(query)
				) {
					results.push({
						type: "task",
						id: task.id,
						title: task.title,
						subtitle: `Task: ${task.id} (${task.section})`,
						url: "/tasks",
					});
				}
			}
		}

		return results;
	});
