import { describe, expect, it } from "vitest";
import type { AgentSessionInfo } from "#/lib/agent-sessions";
import type { BranchScanEntry, ReviewBranchMatch } from "#/lib/branch-links";
import {
	buildPlanWorkContext,
	extractPlanWorkHints,
} from "#/lib/plans/context";
import type { WorktreeInfo } from "#/lib/worktree";

const worktrees: WorktreeInfo[] = [
	{
		path: "/Users/tester/.codex/worktrees/5f21/web-app",
		commitHash: "abc123",
		branch: "feature/DEMO-100-web-next",
		repoName: "web-app",
		repoPath: "/Users/tester/Projects/web-app",
		commitMessage: "feat: migrate web-app",
		isDirty: true,
		dirtyCount: 3,
		type: "codex",
		issueKey: "DEMO-100",
	},
];

const branches: BranchScanEntry[] = [
	{
		repoName: "web-app",
		repoPath: "/Users/tester/Projects/web-app",
		branch: "origin/feature/DEMO-100-web-next",
		source: "remote",
		remoteName: "origin",
	},
];

const reviews: ReviewBranchMatch[] = [
	{
		id: "41",
		repository: "web-app",
		sourceBranch: "feature/DEMO-100-web-next",
		url: "https://example.test/example-workspace/web-app/pull-requests/41",
	},
];

const agentSessions: AgentSessionInfo[] = [
	{
		agentType: "codex",
		sessionId: "123e4567-e89b-42d3-a456-426614174005",
		title: "web-next migration",
		summary: "DEMO-100 작업 위치 확인",
		lastUserMessage: "web-next 전환 진행해줘",
		transcriptPath: "/Users/tester/.codex/sessions/2026/06/16/session.jsonl",
		cwd: "/Users/tester/.codex/worktrees/5f21/web-app",
		branch: "feature/DEMO-100-web-next",
		lastActiveAt: "2026-06-16T01:20:00.000Z",
		score: 180,
		matchReasons: ["task DEMO-100", "review 41"],
		canResume: true,
	},
];

describe("buildPlanWorkContext", () => {
	it("connects a plan to branch, worktree, and agent session evidence", () => {
		const context = buildPlanWorkContext({
			taskKey: "DEMO-100",
			worktrees,
			branches,
			reviews,
			agentSessions,
		});

		expect(context.relatedWorktrees.map((worktree) => worktree.path)).toEqual([
			"/Users/tester/.codex/worktrees/5f21/web-app",
		]);
		expect(context.relatedBranches).toMatchObject([
			{
				repoName: "web-app",
				normalizedBranch: "feature/DEMO-100-web-next",
				isRemote: true,
				isCheckedOut: true,
				worktreePath: "/Users/tester/.codex/worktrees/5f21/web-app",
				reviewIds: ["41"],
			},
		]);
		expect(
			context.relatedAgentSessions.map((session) => session.sessionId),
		).toEqual(["123e4567-e89b-42d3-a456-426614174005"]);
	});

	it("uses child-task plan hints to link parent pages to active work", () => {
		const hintedWorktree: WorktreeInfo = {
			path: "/Users/tester/.cursor/worktrees/web-app/web-next",
			commitHash: "39a3f8a05",
			branch: "feature/DEMO-102-web-next-shell",
			repoName: "web-app",
			repoPath: "/Users/tester/Projects/web-app",
			commitMessage: "DEMO-102 | chore(repo): 정리",
			isDirty: false,
			dirtyCount: 0,
			type: "developer",
			issueKey: "DEMO-102",
		};
		const hintedSession: AgentSessionInfo = {
			agentType: "cursor",
			sessionId: "123e4567-e89b-42d3-a456-426614174004",
			title: "web-next 파일럿 PR 생성",
			summary: "DEMO-102 작업",
			lastUserMessage: "PR 만들어줘",
			transcriptPath:
				"/Users/tester/.cursor/projects/Users-tester-cursor-worktrees-web-app-web-next/agent-transcripts/123e4567-e89b-42d3-a456-426614174004/123e4567-e89b-42d3-a456-426614174004.jsonl",
			cwd: "/Users/tester/.cursor/worktrees/web-app/web-next",
			branch: "feature/DEMO-102-web-next-shell",
			lastActiveAt: "2026-06-16T09:00:00.000Z",
			score: 180,
			matchReasons: ["task DEMO-102"],
			canResume: true,
		};

		const context = buildPlanWorkContext({
			taskKey: "DEMO-100",
			workHints: {
				taskKeys: ["DEMO-102"],
				branches: ["feature/DEMO-102-web-next-shell"],
				repoPaths: ["/Users/tester/.cursor/worktrees/web-app/web-next"],
			},
			worktrees: [hintedWorktree],
			branches: [
				{
					repoName: "web-app",
					repoPath: "/Users/tester/Projects/web-app",
					branch: "origin/feature/DEMO-102-web-next-shell",
					source: "remote",
				},
			],
			reviews: [
				{
					id: "43",
					repository: "web-app",
					sourceBranch: "feature/DEMO-102-web-next-shell",
					url: "https://example.test/example-workspace/web-app/pull-requests/43",
				},
			],
			agentSessions: [hintedSession],
		});

		expect(context.relatedWorktrees.map((worktree) => worktree.path)).toEqual([
			"/Users/tester/.cursor/worktrees/web-app/web-next",
		]);
		expect(
			context.relatedBranches.map((branch) => branch.normalizedBranch),
		).toEqual(["feature/DEMO-102-web-next-shell"]);
		expect(
			context.relatedAgentSessions.map((session) => session.sessionId),
		).toEqual(["123e4567-e89b-42d3-a456-426614174004"]);
	});
});

describe("extractPlanWorkHints", () => {
	it("extracts child task, repo path, and branch from plan markdown", () => {
		const hints = extractPlanWorkHints([
			{
				filename: "pilot-plan.md",
				content: [
					"- **상위 작업:** [DEMO-100](https://issues.example.test/browse/DEMO-100)",
					"- **하위 작업(현재 변경):** [DEMO-102](https://issues.example.test/browse/DEMO-102)",
					"- **레포:** `/Users/tester/.cursor/worktrees/web-app/web-next`",
					"- **브랜치:** `feature/DEMO-102-web-next-shell`",
				].join("\n"),
			},
		]);

		expect(hints).toEqual({
			taskKeys: ["DEMO-102"],
			branches: ["feature/DEMO-102-web-next-shell"],
			repoPaths: ["/Users/tester/.cursor/worktrees/web-app/web-next"],
		});
	});
});
