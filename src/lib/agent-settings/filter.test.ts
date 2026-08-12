import { describe, expect, it } from "vitest";
import {
	filterAgentSettingsItems,
	getAgentSettingsAgentCounts,
	getAgentSettingsFacetedCounts,
	getAgentSettingsKindCounts,
	getAgentSettingsProjectCounts,
	getAgentSettingsWritePaths,
} from "./filter";
import type { AgentSettingsItem } from "./types";

const items: AgentSettingsItem[] = [
	{
		id: "codex-skill-review",
		agent: "codex",
		kind: "skill",
		name: "Review Helper",
		description: "PR 리뷰를 정리합니다.",
		project: "personal",
		scope: "personal",
		sourcePath: "/Users/tester/.codex/skills/review/SKILL.md",
		enabledByDefault: true,
	},
	{
		id: "claude-rule-git",
		agent: "claude",
		kind: "rule",
		name: "Git Rule",
		description: "Git 작업 규칙",
		project: "personal",
		scope: "personal",
		sourcePath: "/Users/tester/.agents/rules/git.md",
		enabledByDefault: true,
	},
	{
		id: "claude-hook-git",
		agent: "claude",
		kind: "hook",
		name: "guard-git",
		description: "git 명령 실행 전 검사",
		project: "personal",
		scope: "personal",
		sourcePath: "~/.agents/hooks.json",
		enabledByDefault: true,
	},
	{
		id: "codex-rule-workspace",
		agent: "claude",
		agents: ["claude", "cursor", "codex"],
		kind: "rule",
		name: "Workspace AGENTS",
		description: "workspace project rule",
		project: "workspace",
		scope: "project",
		sourcePath: "/Users/tester/Projects/web-app/AGENTS.md",
		enabledByDefault: true,
	},
	{
		id: "codex-rule-personal-toolkit",
		agent: "codex",
		kind: "rule",
		name: "Personal Toolkit AGENTS",
		description: "personal toolkit rule",
		project: "personal",
		scope: "personal",
		sourcePath: "/Users/tester/Projects/agent-toolkit/AGENTS.md",
		enabledByDefault: true,
	},
];

describe("agent settings filters", () => {
	it("filters by kind, agent, and query", () => {
		expect(
			filterAgentSettingsItems(items, {
				agent: "codex",
				kind: "skill",
				project: "all",
				query: "review",
			}),
		).toEqual([items[0]]);
	});

	it("filters by project", () => {
		expect(
			filterAgentSettingsItems(items, {
				agent: "all",
				kind: "all",
				project: "workspace",
				query: "",
			}).map((item) => item.id),
		).toEqual(["codex-rule-workspace"]);
	});

	it("matches Korean descriptions and source paths", () => {
		expect(
			filterAgentSettingsItems(items, {
				agent: "all",
				kind: "all",
				project: "all",
				query: "명령",
			}).map((item) => item.id),
		).toEqual(["claude-hook-git"]);

		expect(
			filterAgentSettingsItems(items, {
				agent: "all",
				kind: "all",
				project: "all",
				query: "rules/git",
			}).map((item) => item.id),
		).toEqual(["claude-rule-git"]);
	});

	it("counts items by kind and agent", () => {
		expect(getAgentSettingsKindCounts(items)).toEqual({
			all: 5,
			hook: 1,
			rule: 3,
			skill: 1,
		});
		expect(getAgentSettingsAgentCounts(items)).toMatchObject({
			all: 5,
			claude: 3,
			codex: 3,
			cursor: 1,
		});
		expect(getAgentSettingsProjectCounts(items)).toMatchObject({
			all: 5,
			personal: 4,
			workspace: 1,
		});
	});

	it("counts each filter group within the other active filters", () => {
		const counts = getAgentSettingsFacetedCounts(items, {
			agent: "all",
			kind: "all",
			project: "workspace",
			query: "",
		});

		expect(counts.agent).toMatchObject({
			all: 1,
			codex: 1,
			claude: 1,
			cursor: 1,
		});
		expect(counts.kind).toMatchObject({
			all: 1,
			rule: 1,
			skill: 0,
		});
		expect(counts.project).toMatchObject({
			all: 5,
			workspace: 1,
			personal: 4,
		});
	});

	it("filters multi-target project settings by each target agent", () => {
		expect(
			filterAgentSettingsItems(items, {
				agent: "cursor",
				kind: "all",
				project: "workspace",
				query: "",
			}).map((item) => item.id),
		).toEqual(["codex-rule-workspace"]);
	});

	it("lists write paths for confirmation", () => {
		expect(
			getAgentSettingsWritePaths([
				{
					...items[0],
					writePaths: ["/active/SKILL.md", "/active/SKILL.md.disabled"],
				},
				items[1],
			]),
		).toEqual([
			"/Users/tester/.agents/rules/git.md",
			"/active/SKILL.md",
			"/active/SKILL.md.disabled",
		]);
	});
});
