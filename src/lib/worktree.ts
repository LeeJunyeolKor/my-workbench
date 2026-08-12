export type WorktreeType =
	| "main"
	| "developer"
	| "claude"
	| "codex"
	| "antigravity";

export type AssociatedPlanInfo = {
	taskId: string;
	progress: number; // 0 to 100
	total: number;
	completed: number;
};

export type WorktreeInfo = {
	path: string;
	commitHash: string;
	branch: string;
	repoName: string;
	repoPath: string;
	commitMessage: string;
	isDirty: boolean;
	dirtyCount: number;
	type: WorktreeType;
	issueKey?: string;
	issueTitle?: string;
	associatedPlan?: AssociatedPlanInfo;
};

export type WorktreeConfig = {
	scanRoots: string[];
	defaultWorktreeDir: string;
};

export type WorktreeRepoSummary = {
	name: string;
	path: string;
	count: number;
};

type WorktreeRepoSource =
	| Pick<WorktreeInfo, "repoName" | "repoPath">
	| null
	| undefined;

export function summarizeWorktreeRepos(
	worktrees: WorktreeRepoSource[],
): WorktreeRepoSummary[] {
	const repoByPath = new Map<string, WorktreeRepoSummary>();

	for (const worktree of worktrees) {
		if (!worktree?.repoPath) continue;

		const existing = repoByPath.get(worktree.repoPath);
		if (existing) {
			existing.count += 1;
			continue;
		}

		repoByPath.set(worktree.repoPath, {
			name: worktree.repoName,
			path: worktree.repoPath,
			count: 1,
		});
	}

	return Array.from(repoByPath.values());
}

export function selectInitialWorktreeRepoPath(
	currentRepoPath: string,
	repos: Pick<WorktreeRepoSummary, "path">[],
) {
	return currentRepoPath || repos[0]?.path || "";
}

// AI Plan 마크다운 진행률 파싱 헬퍼 함수 (node:path 의존성이 없어 클라이언트 공유 가능)
export function parsePlanProgress(planContent: string): {
	progress: number;
	total: number;
	completed: number;
} {
	const todoMatches = planContent.match(/- \[\s\]/g) || [];
	const doneMatches = planContent.match(/- \[[xX]\]/g) || [];
	const completed = doneMatches.length;
	const total = todoMatches.length + doneMatches.length;
	const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

	return {
		progress,
		total,
		completed,
	};
}
