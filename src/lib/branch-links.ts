import type { WorktreeInfo } from "#/lib/worktree";

export type BranchScanEntry = {
	repoName: string;
	repoPath: string;
	branch: string;
	source: "local" | "remote";
	remoteName?: string;
};

export type ReviewBranchMatch = {
	id: string;
	repository: string;
	sourceBranch: string;
	url: string;
};

export type RelatedBranchInfo = {
	repoName: string;
	repoPath: string;
	branch: string;
	normalizedBranch: string;
	isLocal: boolean;
	isRemote: boolean;
	isCheckedOut: boolean;
	worktreePath: string | null;
	issueKey?: string;
	reviewIds: string[];
};

export function normalizeBranchName(branch: string): string {
	let normalized = branch.trim();
	normalized = normalized.replace(/^refs\/heads\//, "");
	normalized = normalized.replace(/^refs\/remotes\//, "");
	normalized = normalized.replace(/^remotes\//, "");
	normalized = normalized.replace(/^origin\//, "");
	return normalized;
}

export function extractTaskKeyFromText(text: string): string | null {
	const match = text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/i);
	return match?.[1]?.toUpperCase() ?? null;
}

function includesTask(text: string, taskKey: string) {
	return text.toUpperCase().includes(taskKey.toUpperCase());
}

function branchKey(repoName: string, normalizedBranch: string) {
	return `${repoName}\u001f${normalizedBranch}`;
}

function sameRepo(
	branch: BranchScanEntry | RelatedBranchInfo,
	wt: WorktreeInfo,
) {
	return branch.repoPath === wt.repoPath || branch.repoName === wt.repoName;
}

export function buildRelatedBranches(input: {
	taskKey: string | null;
	branches?: BranchScanEntry[];
	worktrees?: WorktreeInfo[];
	reviews?: ReviewBranchMatch[];
}): RelatedBranchInfo[] {
	if (!input.taskKey) return [];

	const related = new Map<string, RelatedBranchInfo>();
	const taskKey = input.taskKey.toUpperCase();
	const worktrees = input.worktrees ?? [];
	const reviews = input.reviews ?? [];

	const ensureBranch = (
		repoName: string,
		repoPath: string,
		branch: string,
	): RelatedBranchInfo => {
		const normalizedBranch = normalizeBranchName(branch);
		const key = branchKey(repoName, normalizedBranch);
		const existing = related.get(key);
		if (existing) return existing;

		const entry: RelatedBranchInfo = {
			repoName,
			repoPath,
			branch: normalizedBranch,
			normalizedBranch,
			isLocal: false,
			isRemote: false,
			isCheckedOut: false,
			worktreePath: null,
			issueKey: taskKey,
			reviewIds: [],
		};
		related.set(key, entry);
		return entry;
	};

	for (const branch of input.branches ?? []) {
		const normalizedBranch = normalizeBranchName(branch.branch);
		if (!includesTask(normalizedBranch, taskKey)) continue;

		const entry = ensureBranch(
			branch.repoName,
			branch.repoPath,
			normalizedBranch,
		);
		if (branch.source === "local") {
			entry.isLocal = true;
			entry.branch = normalizedBranch;
		}
		if (branch.source === "remote") entry.isRemote = true;
	}

	for (const wt of worktrees) {
		const normalizedBranch = normalizeBranchName(wt.branch);
		if (!includesTask(normalizedBranch, taskKey) && wt.issueKey !== taskKey) {
			continue;
		}

		const entry = ensureBranch(wt.repoName, wt.repoPath, normalizedBranch);
		entry.isLocal = true;
		entry.isCheckedOut = true;
		entry.worktreePath = wt.path;
	}

	for (const review of reviews) {
		const normalizedBranch = normalizeBranchName(review.sourceBranch);
		if (!includesTask([normalizedBranch, review.url].join("\n"), taskKey)) {
			continue;
		}

		const existing = Array.from(related.values()).find(
			(entry) =>
				entry.repoName === review.repository &&
				entry.normalizedBranch === normalizedBranch,
		);
		const entry =
			existing ?? ensureBranch(review.repository, "", normalizedBranch);
		if (!entry.reviewIds.includes(review.id)) {
			entry.reviewIds.push(review.id);
		}
	}

	for (const entry of related.values()) {
		const matchedWorktree = worktrees.find(
			(wt) =>
				sameRepo(entry, wt) &&
				normalizeBranchName(wt.branch) === entry.normalizedBranch,
		);
		if (!matchedWorktree) continue;
		entry.isCheckedOut = true;
		entry.worktreePath = matchedWorktree.path;
		entry.isLocal = true;
	}

	return Array.from(related.values()).sort((a, b) => {
		if (a.isCheckedOut !== b.isCheckedOut) return a.isCheckedOut ? -1 : 1;
		if (a.repoName !== b.repoName) return a.repoName.localeCompare(b.repoName);
		return a.normalizedBranch.localeCompare(b.normalizedBranch);
	});
}
