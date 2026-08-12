import { describe, expect, it } from "vitest";
import { getWorktreeType } from "#/server/worktree-impl";
import {
	parsePlanProgress,
	selectInitialWorktreeRepoPath,
	summarizeWorktreeRepos,
} from "./worktree";

describe("getWorktreeType", () => {
	const repoPath = "/Users/test/Projects/workbench";

	it("should return main if wtPath equals repoPath", () => {
		expect(getWorktreeType("/Users/test/Projects/workbench", repoPath)).toBe(
			"main",
		);
		expect(getWorktreeType("/Users/test/Projects/workbench/", repoPath)).toBe(
			"main",
		);
	});

	it("should return claude if path contains .claude or claude-", () => {
		expect(
			getWorktreeType(
				"/Users/test/Projects/workbench/.claude/worktree",
				repoPath,
			),
		).toBe("claude");
		expect(
			getWorktreeType(
				"/Users/test/Projects/workbench-wt-claude-feat",
				repoPath,
			),
		).toBe("claude");
	});

	it("should return codex if path contains .codex or codex-", () => {
		expect(
			getWorktreeType("/Users/test/Projects/workbench/.codex/wt", repoPath),
		).toBe("codex");
		expect(
			getWorktreeType("/Users/test/Projects/workbench-wt-codex-fix", repoPath),
		).toBe("codex");
	});

	it("should return antigravity if path contains .gemini or antigravity or .system_generated", () => {
		expect(
			getWorktreeType("/Users/test/.gemini/antigravity/brain/wt", repoPath),
		).toBe("antigravity");
		expect(
			getWorktreeType(
				"/Users/test/Projects/workbench-wt-antigravity-test",
				repoPath,
			),
		).toBe("antigravity");
		expect(
			getWorktreeType(
				"/Users/test/Projects/workbench/.system_generated/wt",
				repoPath,
			),
		).toBe("antigravity");
	});

	it("should return developer for ordinary user worktrees", () => {
		expect(
			getWorktreeType("/Users/test/Projects/workbench-wt-feature-x", repoPath),
		).toBe("developer");
	});
});

describe("parsePlanProgress", () => {
	it("should parse progress from markdown content", () => {
		const plan = `
# Plan
- [x] Task 1
- [ ] Task 2
- [x] Task 3
- [ ] Task 4
- [x] Task 5
    `;
		const result = parsePlanProgress(plan);
		expect(result.total).toBe(5);
		expect(result.completed).toBe(3);
		expect(result.progress).toBe(60);
	});

	it("should return 0 progress if no tasks found", () => {
		const plan = `
# Plan without tasks
    `;
		const result = parsePlanProgress(plan);
		expect(result.total).toBe(0);
		expect(result.completed).toBe(0);
		expect(result.progress).toBe(0);
	});
});

describe("summarizeWorktreeRepos", () => {
	it("deduplicates repo choices and counts worktrees per repo", () => {
		const result = summarizeWorktreeRepos([
			{
				repoName: "workbench",
				repoPath: "/Users/test/Projects/workbench",
			},
			{
				repoName: "frontend",
				repoPath: "/Users/test/Projects/frontend",
			},
			{
				repoName: "workbench",
				repoPath: "/Users/test/Projects/workbench",
			},
			{
				repoName: "missing",
				repoPath: "",
			},
		]);

		expect(result).toEqual([
			{
				name: "workbench",
				path: "/Users/test/Projects/workbench",
				count: 2,
			},
			{
				name: "frontend",
				path: "/Users/test/Projects/frontend",
				count: 1,
			},
		]);
	});
});

describe("selectInitialWorktreeRepoPath", () => {
	it("preserves an existing selection and otherwise chooses the first repo", () => {
		const repos = [
			{ name: "workbench", path: "/Users/test/Projects/workbench", count: 2 },
			{ name: "frontend", path: "/Users/test/Projects/frontend", count: 1 },
		];

		expect(selectInitialWorktreeRepoPath("/custom/repo", repos)).toBe(
			"/custom/repo",
		);
		expect(selectInitialWorktreeRepoPath("", repos)).toBe(
			"/Users/test/Projects/workbench",
		);
		expect(selectInitialWorktreeRepoPath("", [])).toBe("");
	});
});
