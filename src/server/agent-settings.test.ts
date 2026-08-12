import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentSettingsItem } from "#/lib/agent-settings/types";
import {
	getProjectAgentConfigSources,
	getProjectAgentTargets,
	readHooks,
	readProjectRules,
	readSkillFile,
	setAgentSettingItemsEnabled,
	setAgentSettingTargetsEnabled,
} from "./agent-settings";

describe("getProjectAgentConfigSources", () => {
	it("includes repo-packaged agent settings directories", () => {
		const sources = getProjectAgentConfigSources("/repo/web-app");

		expect(sources.ruleDirs).toContain("/repo/web-app/agents-config/rules");
		expect(sources.ruleDirs).toContain("/repo/web-app/.agents/rules");
		expect(sources.skillDirs).toContain("/repo/web-app/agents-config/skills");
		expect(sources.hookFiles).toContain(
			"/repo/web-app/agents-config/hooks.json",
		);
	});

	it("derives target agents from project config locations", () => {
		expect(
			getProjectAgentTargets(
				"/repo/web-app",
				"/repo/web-app/agents-config/skills/review-helper/SKILL.md",
			),
		).toEqual(["codex", "claude", "cursor"]);
		expect(
			getProjectAgentTargets(
				"/repo/web-app",
				"/repo/web-app/.agents/rules/dev-workflow.md",
			),
		).toEqual(["claude"]);
		expect(
			getProjectAgentTargets(
				"/repo/agent-toolkit",
				"/repo/agent-toolkit/skills/pr-create/SKILL.md",
			),
		).toEqual(["claude", "cursor"]);
	});
});

describe("agent setting filesystem toggles", () => {
	it("disables and re-enables a skill by renaming SKILL.md", async () => {
		const root = await fs.mkdtemp(
			path.join(os.tmpdir(), "my-workbench-skill-"),
		);
		const skillDir = path.join(root, "skills", "demo");
		const activePath = path.join(skillDir, "SKILL.md");
		const disabledPath = `${activePath}.disabled`;
		await fs.mkdir(skillDir, { recursive: true });
		await fs.writeFile(
			activePath,
			"---\nname: demo\ndescription: demo skill\n---\n",
		);

		const activeItem = await readSkillFile(activePath, {
			agent: "claude",
			project: "personal",
			scope: "personal",
			sourceRoot: path.join(root, "skills"),
		});

		await setAgentSettingItemsEnabled([activeItem], false);
		await expect(fs.access(disabledPath)).resolves.toBeUndefined();
		await expect(fs.access(activePath)).rejects.toThrow();

		const disabledItem = await readSkillFile(disabledPath, {
			agent: "claude",
			project: "personal",
			scope: "personal",
			sourceRoot: path.join(root, "skills"),
		});
		expect(disabledItem.id).toBe(activeItem.id);
		expect(disabledItem.enabledByDefault).toBe(false);

		await setAgentSettingItemsEnabled([disabledItem], true);
		await expect(fs.access(activePath)).resolves.toBeUndefined();
		await expect(fs.access(disabledPath)).rejects.toThrow();
	});

	it("disables and re-enables a rule without changing rules-meta policy", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-workbench-rule-"));
		const rulesDir = path.join(root, "rules");
		const rulePath = path.join(rulesDir, "guard.md");
		const disabledPath = `${rulePath}.disabled`;
		const metaPath = path.join(root, "rules-meta.json");
		const meta = { guard: { alwaysApply: false, description: "policy" } };
		await fs.mkdir(rulesDir, { recursive: true });
		await fs.writeFile(rulePath, "# Guard\n");
		await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

		const [activeItem] = await readProjectRules(rulesDir, "workspace", {
			agents: ["claude"],
			metaPath,
		});

		await setAgentSettingItemsEnabled([activeItem], false);
		await expect(fs.access(disabledPath)).resolves.toBeUndefined();
		expect(JSON.parse(await fs.readFile(metaPath, "utf8"))).toEqual(meta);

		const [disabledItem] = await readProjectRules(rulesDir, "workspace", {
			agents: ["claude"],
			metaPath,
		});
		expect(disabledItem.id).toBe(activeItem.id);
		expect(disabledItem.enabledByDefault).toBe(false);

		await setAgentSettingItemsEnabled([disabledItem], true);
		await expect(fs.access(rulePath)).resolves.toBeUndefined();
		expect(JSON.parse(await fs.readFile(metaPath, "utf8"))).toEqual(meta);
	});

	it("disables hooks through a sidecar and restores them", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-workbench-hook-"));
		const hooksPath = path.join(root, "hooks.json");
		const sidecarPath = `${hooksPath}.my-workbench-disabled.json`;
		await fs.writeFile(
			hooksPath,
			JSON.stringify(
				{
					hooks: {
						beforeShellExecution: [
							{ command: "node guard.js", matcher: "git", timeout: 3 },
						],
					},
				},
				null,
				2,
			),
		);

		const [activeItem] = await readHooks(hooksPath, "claude");
		await setAgentSettingItemsEnabled([activeItem], false);

		expect(JSON.parse(await fs.readFile(hooksPath, "utf8"))).toEqual({
			hooks: {},
		});
		const sidecar = JSON.parse(await fs.readFile(sidecarPath, "utf8"));
		expect(sidecar.disabled).toHaveLength(1);

		const [disabledItem] = await readHooks(hooksPath, "claude");
		expect(disabledItem.id).toBe(activeItem.id);
		expect(disabledItem.enabledByDefault).toBe(false);

		await setAgentSettingItemsEnabled([disabledItem], true);
		expect(JSON.parse(await fs.readFile(hooksPath, "utf8")).hooks).toEqual({
			beforeShellExecution: [
				{ command: "node guard.js", matcher: "git", timeout: 3 },
			],
		});
		expect(JSON.parse(await fs.readFile(sidecarPath, "utf8")).disabled).toEqual(
			[],
		);
	});

	it("only changes the items passed to a bulk toggle", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-workbench-bulk-"));
		const first = path.join(root, "one", "SKILL.md");
		const second = path.join(root, "two", "SKILL.md");
		await fs.mkdir(path.dirname(first), { recursive: true });
		await fs.mkdir(path.dirname(second), { recursive: true });
		await fs.writeFile(first, "---\nname: one\n---\n");
		await fs.writeFile(second, "---\nname: two\n---\n");

		const item = {
			id: "one",
			agent: "claude",
			kind: "skill",
			name: "one",
			description: "one",
			project: "personal",
			scope: "personal",
			sourcePath: first,
			enabledByDefault: true,
		} satisfies AgentSettingsItem;

		await setAgentSettingItemsEnabled([item], false);

		await expect(fs.access(`${first}.disabled`)).resolves.toBeUndefined();
		await expect(fs.access(second)).resolves.toBeUndefined();
	});

	it("resolves stale client ids by stable item fields", async () => {
		const root = await fs.mkdtemp(
			path.join(os.tmpdir(), "my-workbench-stale-id-"),
		);
		const skillDir = path.join(root, "skills", "demo");
		const activePath = path.join(skillDir, "SKILL.md");
		await fs.mkdir(skillDir, { recursive: true });
		await fs.writeFile(
			activePath,
			"---\nname: demo\ndescription: demo skill\n---\n",
		);
		const item = await readSkillFile(activePath, {
			agent: "claude",
			project: "personal",
			scope: "personal",
			sourceRoot: path.join(root, "skills"),
		});

		await setAgentSettingTargetsEnabled(
			[{ ...item, id: "stale-client-id" }],
			false,
			[item],
		);

		await expect(fs.access(`${activePath}.disabled`)).resolves.toBeUndefined();
	});
});
