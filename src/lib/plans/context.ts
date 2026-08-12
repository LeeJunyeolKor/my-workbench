import type { AgentSessionInfo } from "#/lib/agent-sessions";
import {
	type BranchScanEntry,
	buildRelatedBranches,
	type RelatedBranchInfo,
	type ReviewBranchMatch,
} from "#/lib/branch-links";
import type { WorktreeInfo } from "#/lib/worktree";

export type PlanWorkHints = {
	taskKeys: string[];
	branches: string[];
	repoPaths: string[];
};

export type PlanWorkContext = {
	relatedWorktrees: WorktreeInfo[];
	relatedBranches: RelatedBranchInfo[];
	relatedAgentSessions: AgentSessionInfo[];
};

function unique(values: string[]) {
	return Array.from(new Set(values.filter(Boolean)));
}

function taskKeysFromText(text: string) {
	return Array.from(text.matchAll(/\b([A-Z][A-Z0-9]+-\d+)\b/gi)).map((match) =>
		match[1].toUpperCase(),
	);
}

function stripMarkdownValue(value: string) {
	return value
		.split("|")[0]
		.replace(/^[\s\-*|:]+/, "")
		.replace(/[`*_]/g, "")
		.trim();
}

export function extractPlanWorkHints(
	files: Array<{ filename: string; content: string }>,
): PlanWorkHints {
	const taskKeys: string[] = [];
	const branches: string[] = [];
	const repoPaths: string[] = [];

	for (const file of files) {
		for (const line of file.content.split("\n")) {
			if (/하위\s*(?:작업|티켓)|현재\s*(?:변경|PR)/i.test(line)) {
				taskKeys.push(...taskKeysFromText(line));
			}

			const branchMatch = line.match(/브랜치[^:：|]*[:：]\s*(.+)$/i);
			if (branchMatch) branches.push(stripMarkdownValue(branchMatch[1]));

			const pathMatch = line.match(
				/(?:레포|워크트리|작업\s*루트)[^:：|]*[:：][\s*]*`?((?:~\/|\/)[^`\n|]+)/i,
			);
			if (pathMatch) repoPaths.push(stripMarkdownValue(pathMatch[1]));
		}
	}

	return {
		taskKeys: unique(taskKeys),
		branches: unique(branches),
		repoPaths: unique(repoPaths),
	};
}

export function buildPlanWorkContext(input: {
	taskKey: string | null;
	workHints?: PlanWorkHints;
	worktrees?: WorktreeInfo[];
	branches?: BranchScanEntry[];
	reviews?: ReviewBranchMatch[];
	agentSessions?: AgentSessionInfo[];
}): PlanWorkContext {
	if (!input.taskKey) {
		return {
			relatedWorktrees: [],
			relatedBranches: [],
			relatedAgentSessions: [],
		};
	}

	const taskKeys = unique([
		input.taskKey.toUpperCase(),
		...(input.workHints?.taskKeys ?? []).map((taskKey) =>
			taskKey.toUpperCase(),
		),
	]);
	const hintedBranches = input.workHints?.branches ?? [];
	const hintedRepoPaths = input.workHints?.repoPaths ?? [];
	const taskMatches = (value: string) => {
		const upperValue = value.toUpperCase();
		return taskKeys.some((taskKey) => upperValue.includes(taskKey));
	};
	const branchMatches = (value: string) => {
		const lowerValue = value.toLowerCase();
		return hintedBranches.some((branch) =>
			lowerValue.includes(branch.toLowerCase()),
		);
	};
	const repoPathMatches = (value: string) =>
		hintedRepoPaths.some(
			(repoPath) => value === repoPath || value.includes(repoPath),
		);
	const reviews = input.reviews ?? [];
	const relatedReviews = reviews.filter(
		(review) =>
			taskMatches([review.sourceBranch, review.url].join("\n")) ||
			branchMatches(review.sourceBranch),
	);
	const relatedReviewIds = new Set(
		relatedReviews.map((review) => `review ${review.id}`),
	);
	const relatedWorktrees = (input.worktrees ?? []).filter(
		(worktree) =>
			(worktree.issueKey ? taskKeys.includes(worktree.issueKey) : false) ||
			taskMatches(worktree.branch) ||
			taskMatches(worktree.path) ||
			branchMatches(worktree.branch) ||
			repoPathMatches(worktree.path),
	);
	const relatedBranches = uniqueRelatedBranches(
		taskKeys.flatMap((taskKey) =>
			buildRelatedBranches({
				taskKey,
				branches: input.branches,
				worktrees: input.worktrees,
				reviews,
			}),
		),
	);

	return {
		relatedWorktrees,
		relatedBranches,
		relatedAgentSessions: (input.agentSessions ?? []).filter(
			(session) =>
				session.matchReasons.some(
					(reason) => taskMatches(reason) || relatedReviewIds.has(reason),
				) ||
				(session.branch
					? taskMatches(session.branch) || branchMatches(session.branch)
					: false) ||
				(session.cwd
					? relatedWorktrees.some(
							(worktree) => worktree.path === session.cwd,
						) || repoPathMatches(session.cwd)
					: false),
		),
	};
}

function uniqueRelatedBranches(branches: RelatedBranchInfo[]) {
	const byKey = new Map<string, RelatedBranchInfo>();
	for (const branch of branches) {
		const key = `${branch.repoName}\u001f${branch.normalizedBranch}`;
		if (!byKey.has(key)) byKey.set(key, branch);
	}
	return Array.from(byKey.values());
}
