import { describe, expect, it } from "vitest";
import {
	type BranchScanEntry,
	buildRelatedBranches,
	type ReviewBranchMatch,
} from "#/lib/branch-links";
import type { WorktreeInfo } from "#/lib/worktree";

const branches: BranchScanEntry[] = [
	{
		repoName: "web-app",
		repoPath: "/Users/tester/Projects/web-app",
		branch: "feature/DEMO-101-settings-panel",
		source: "local",
	},
	{
		repoName: "web-app",
		repoPath: "/Users/tester/Projects/web-app",
		branch: "origin/feature/DEMO-101-settings-panel",
		source: "remote",
		remoteName: "origin",
	},
	{
		repoName: "web-app",
		repoPath: "/Users/tester/Projects/web-app",
		branch: "feature/DEMO-100-web-next-pilot",
		source: "local",
	},
];

const worktrees: WorktreeInfo[] = [
	{
		path: "/Users/tester/.cursor/worktrees/web-app/web-next",
		commitHash: "abc123",
		branch: "feature/DEMO-100-web-next-pilot",
		repoName: "web-app",
		repoPath: "/Users/tester/Projects/web-app",
		commitMessage: "feat",
		isDirty: false,
		dirtyCount: 0,
		type: "developer",
		issueKey: "DEMO-100",
	},
];

const reviews: ReviewBranchMatch[] = [
	{
		id: "42",
		repository: "web-app",
		sourceBranch: "feature/DEMO-101-settings-panel",
		url: "https://example.test/example-workspace/web-app/pull-requests/42",
	},
];

describe("buildRelatedBranches", () => {
	it("matches a task branch and deduplicates origin/local refs", () => {
		const related = buildRelatedBranches({
			taskKey: "DEMO-101",
			branches,
			worktrees,
			reviews,
		});

		expect(related).toHaveLength(1);
		expect(related[0]).toMatchObject({
			repoName: "web-app",
			branch: "feature/DEMO-101-settings-panel",
			normalizedBranch: "feature/DEMO-101-settings-panel",
			isLocal: true,
			isRemote: true,
			isCheckedOut: false,
			worktreePath: null,
			issueKey: "DEMO-101",
			reviewIds: ["42"],
		});
	});

	it("marks a branch as checked out when a matching worktree exists", () => {
		const related = buildRelatedBranches({
			taskKey: "DEMO-100",
			branches,
			worktrees,
			reviews,
		});

		expect(related).toHaveLength(1);
		expect(related[0]?.isCheckedOut).toBe(true);
		expect(related[0]?.worktreePath).toBe(
			"/Users/tester/.cursor/worktrees/web-app/web-next",
		);
	});
});
