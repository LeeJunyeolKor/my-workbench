import { describe, expect, it } from "vitest";
import {
	parseCreateWorktreeInput,
	parseGetBranchesInput,
	parseGetWorktreesInput,
	parseOpenAgentSessionInput,
	parseOpenInToolInput,
	parseRemoveWorktreeInput,
	parseWorktreeConfigInput,
} from "./worktrees";

describe("parseWorktreeConfigInput", () => {
	it("trims valid worktree config paths", () => {
		expect(
			parseWorktreeConfigInput({
				scanRoots: [" ~/Projects ", " /tmp/repos "],
				defaultWorktreeDir: " ~/Projects/worktrees ",
			}),
		).toEqual({
			scanRoots: ["~/Projects", "/tmp/repos"],
			defaultWorktreeDir: "~/Projects/worktrees",
		});
	});

	it("rejects config without scan roots", () => {
		expect(() =>
			parseWorktreeConfigInput({
				scanRoots: ["  "],
				defaultWorktreeDir: "~/Projects/worktrees",
			}),
		).toThrow("워크트리 스캔 경로를 입력해 주세요.");
	});

	it("rejects config without a default worktree directory", () => {
		expect(() =>
			parseWorktreeConfigInput({
				scanRoots: ["~/Projects"],
				defaultWorktreeDir: " ",
			}),
		).toThrow("기본 워크트리 생성 위치를 입력해 주세요.");
	});
});

describe("parseCreateWorktreeInput", () => {
	it("trims valid worktree creation input", () => {
		expect(
			parseCreateWorktreeInput({
				repoPath: " /repo/web-app ",
				branchName: " feature/DEMO-101-worktree ",
				isNew: true,
				baseBranch: " origin/main ",
				customPath: " ~/Projects/web-app-worktree ",
			}),
		).toEqual({
			repoPath: "/repo/web-app",
			branchName: "feature/DEMO-101-worktree",
			isNew: true,
			baseBranch: "origin/main",
			customPath: "~/Projects/web-app-worktree",
		});
	});

	it("rejects empty branch names before creating a worktree", () => {
		expect(() =>
			parseCreateWorktreeInput({
				repoPath: "/repo/web-app",
				branchName: " ",
				isNew: false,
			}),
		).toThrow("워크트리를 생성할 브랜치를 입력해 주세요.");
	});

	it("rejects shell-unsafe branch input before creating a worktree", () => {
		expect(() =>
			parseCreateWorktreeInput({
				repoPath: "/repo/web-app",
				branchName: 'feature/name"; touch /tmp/web-app',
				isNew: false,
			}),
		).toThrow("브랜치 이름에 사용할 수 없는 문자가 있습니다.");
	});

	it("rejects shell-unsafe base branches before creating a worktree", () => {
		expect(() =>
			parseCreateWorktreeInput({
				repoPath: "/repo/web-app",
				branchName: "feature/safe",
				isNew: true,
				baseBranch: "origin/main; touch /tmp/web-app",
			}),
		).toThrow("기준 브랜치 이름에 사용할 수 없는 문자가 있습니다.");
	});

	it("rejects shell-unsafe custom paths before creating a worktree", () => {
		expect(() =>
			parseCreateWorktreeInput({
				repoPath: "/repo/web-app",
				branchName: "feature/safe",
				isNew: false,
				customPath: '"/tmp/web-app"',
			}),
		).toThrow("워크트리 저장 경로에 사용할 수 없는 문자가 있습니다.");
	});
});

describe("parseGetBranchesInput", () => {
	it("trims valid branch lookup input", () => {
		expect(
			parseGetBranchesInput({
				repoPath: " /repo/web-app ",
			}),
		).toEqual({
			repoPath: "/repo/web-app",
		});
	});

	it("rejects empty repo paths before looking up branches", () => {
		expect(() =>
			parseGetBranchesInput({
				repoPath: " ",
			}),
		).toThrow("브랜치를 조회할 저장소를 선택해 주세요.");
	});
});

describe("parseGetWorktreesInput", () => {
	it("keeps missing refresh options as default worktree lookup input", () => {
		expect(parseGetWorktreesInput(undefined)).toEqual({});
		expect(parseGetWorktreesInput({})).toEqual({});
	});

	it("keeps boolean refresh options before loading worktrees", () => {
		expect(parseGetWorktreesInput({ forceRefresh: true })).toEqual({
			forceRefresh: true,
		});
		expect(parseGetWorktreesInput({ forceRefresh: false })).toEqual({
			forceRefresh: false,
		});
	});

	it("rejects non-boolean refresh options before loading worktrees", () => {
		expect(() =>
			parseGetWorktreesInput({
				forceRefresh: "false",
			}),
		).toThrow("워크트리 새로고침 옵션 형식이 올바르지 않습니다.");
	});
});

describe("parseRemoveWorktreeInput", () => {
	it("trims valid remove-worktree input", () => {
		expect(
			parseRemoveWorktreeInput({
				path: " /repo/web-app-wt-feature ",
				force: true,
			}),
		).toEqual({
			path: "/repo/web-app-wt-feature",
			force: true,
		});
	});

	it("rejects empty paths before removing a worktree", () => {
		expect(() =>
			parseRemoveWorktreeInput({
				path: " ",
			}),
		).toThrow("삭제할 워크트리 위치를 선택해 주세요.");
	});

	it("rejects shell-unsafe paths before removing a worktree", () => {
		expect(() =>
			parseRemoveWorktreeInput({
				path: '/repo/web-app"; rm -rf /tmp/web-app',
			}),
		).toThrow("삭제할 워크트리 위치에 사용할 수 없는 문자가 있습니다.");
	});

	it("rejects non-boolean force values before removing a worktree", () => {
		expect(() =>
			parseRemoveWorktreeInput({
				path: "/repo/web-app-wt-feature",
				force: "false",
			}),
		).toThrow("워크트리 강제 삭제 옵션 형식이 올바르지 않습니다.");
	});
});

describe("parseOpenInToolInput", () => {
	it("trims valid open-in-tool input", () => {
		expect(
			parseOpenInToolInput({
				path: " /repo/web-app ",
				tool: "codex",
			}),
		).toEqual({
			path: "/repo/web-app",
			tool: "codex",
		});
	});

	it("rejects empty paths before opening a tool", () => {
		expect(() =>
			parseOpenInToolInput({
				path: " ",
				tool: "cursor",
			}),
		).toThrow("열 작업 위치를 선택해 주세요.");
	});

	it("rejects unsupported tools before opening a tool", () => {
		expect(() =>
			parseOpenInToolInput({
				path: "/repo/web-app",
				tool: "vim",
			}),
		).toThrow("지원하지 않는 도구입니다.");
	});

	it("rejects shell-unsafe paths before opening a tool", () => {
		expect(() =>
			parseOpenInToolInput({
				path: '/repo/web-app"; touch /tmp/web-app',
				tool: "cursor",
			}),
		).toThrow("열 작업 위치에 사용할 수 없는 문자가 있습니다.");
	});
});

describe("parseOpenAgentSessionInput", () => {
	it("trims valid agent session launch input", () => {
		expect(
			parseOpenAgentSessionInput({
				agentType: "codex",
				sessionId: " 123e4567-e89b-42d3-a456-426614174002 ",
				cwd: " /repo/web-app ",
			}),
		).toEqual({
			agentType: "codex",
			sessionId: "123e4567-e89b-42d3-a456-426614174002",
			cwd: "/repo/web-app",
		});
	});

	it("keeps missing optional agent session fields omitted", () => {
		expect(
			parseOpenAgentSessionInput({
				agentType: "cursor",
			}),
		).toEqual({
			agentType: "cursor",
		});
	});

	it("rejects unsupported agent session types before opening a terminal", () => {
		expect(() =>
			parseOpenAgentSessionInput({
				agentType: "vim",
			}),
		).toThrow("지원하지 않는 에이전트 세션입니다.");
	});

	it("rejects non-string optional agent session fields", () => {
		expect(() =>
			parseOpenAgentSessionInput({
				agentType: "codex",
				sessionId: 123,
			}),
		).toThrow("에이전트 세션 ID 형식이 올바르지 않습니다.");
	});
});
