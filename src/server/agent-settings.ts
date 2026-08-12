"use server";

import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type {
	AgentSettingsAgent,
	AgentSettingsDetail,
	AgentSettingsInventory,
	AgentSettingsItem,
	AgentSettingsKind,
	AgentSettingsProject,
	AgentSettingsScope,
} from "#/lib/agent-settings/types";
import { renderPlanHtml } from "#/lib/plans/parser";

type RuleMeta = {
	description?: string;
	alwaysApply?: boolean;
	globs?: string;
};

type HookConfigEntry = {
	command?: string;
	matcher?: string;
	timeout?: number;
};

type HooksConfig = {
	hooks?: Record<string, HookConfigEntry[]>;
};

type DisabledHookEntry = {
	id: string;
	index?: number;
	phase: string;
	hook: HookConfigEntry;
};

type DisabledHooksSidecar = {
	version: 1;
	disabled: DisabledHookEntry[];
};

type AgentSettingsToggleResult = {
	changedFiles: string[];
};

type AgentSettingsToggleTarget = {
	id: string;
	agent?: AgentSettingsAgent;
	description?: string;
	kind?: AgentSettingsKind;
	name?: string;
	sourcePath?: string;
};

function projectRoot() {
	return process.cwd();
}

function homeDir() {
	return os.homedir();
}

function agentsHome() {
	return path.join(homeDir(), ".agents");
}

function codexHome() {
	return path.join(homeDir(), ".codex");
}

function projectSources(): Array<{
	project: Exclude<AgentSettingsProject, "personal">;
	root: string;
}> {
	return [{ project: "workspace", root: projectRoot() }];
}

export const getAgentSettingsInventory = createServerFn({
	method: "GET",
}).handler(async () => {
	return buildAgentSettingsInventory();
});

export const getAgentSettingDetail = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		const inventory = await buildAgentSettingsInventory();
		const item = inventory.items.find((candidate) => candidate.id === data.id);
		if (!item) {
			throw new Error("설정 항목을 찾지 못했습니다.");
		}

		const raw = await safeReadText(item.sourcePath);
		const markdown = buildDetailMarkdown(item, raw);

		return {
			item,
			markdown,
			raw,
			html: renderPlanHtml(markdown),
		} satisfies AgentSettingsDetail;
	});

export const setAgentSettingsEnabled = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			enabled: boolean;
			ids?: string[];
			targets?: AgentSettingsToggleTarget[];
		}) => data,
	)
	.handler(async ({ data }) => {
		const targets = data.targets ?? data.ids?.map((id) => ({ id })) ?? [];
		return setAgentSettingTargetsEnabled(targets, data.enabled);
	});

async function buildAgentSettingsInventory(): Promise<AgentSettingsInventory> {
	const items = await Promise.all([
		readAgentsSkills(),
		readCodexSkills(),
		readAgentRules(),
		readCodexRules(),
		readCursorRules(),
		readGeminiRules(),
		readProjectAgentConfigs(),
		readHooks(path.join(agentsHome(), "hooks.json"), "claude"),
		readHooks(path.join(codexHome(), "hooks.json"), "codex"),
	]);
	const flatItems = items
		.flat()
		.filter((item, index, list) => {
			return list.findIndex((candidate) => candidate.id === item.id) === index;
		})
		.sort((a, b) => {
			return `${a.agent}-${a.kind}-${a.name}`.localeCompare(
				`${b.agent}-${b.kind}-${b.name}`,
			);
		});

	return {
		items: flatItems,
		scannedAt: new Date().toISOString(),
		sources: Array.from(new Set(flatItems.map((item) => item.sourcePath))),
	};
}

export async function setAgentSettingTargetsEnabled(
	targets: AgentSettingsToggleTarget[],
	enabled: boolean,
	inventoryItems?: AgentSettingsItem[],
): Promise<AgentSettingsToggleResult> {
	const inventory =
		inventoryItems ?? (await buildAgentSettingsInventory()).items;
	const items = targets.map((target) =>
		resolveAgentSettingTarget(inventory, target),
	);
	if (items.some((item) => !item)) {
		throw new Error("일부 설정 항목을 찾지 못했습니다.");
	}

	return setAgentSettingItemsEnabled(items.filter(isPresent), enabled);
}

export async function setAgentSettingItemsEnabled(
	items: AgentSettingsItem[],
	enabled: boolean,
): Promise<AgentSettingsToggleResult> {
	const changedFiles = new Set<string>();

	for (const item of items) {
		const files = await setAgentSettingItemEnabled(item, enabled);
		for (const file of files) changedFiles.add(file);
	}

	return { changedFiles: Array.from(changedFiles).sort() };
}

function resolveAgentSettingTarget(
	items: AgentSettingsItem[],
	target: AgentSettingsToggleTarget,
) {
	const idMatch = items.find((item) => item.id === target.id);
	if (idMatch) return idMatch;

	const candidates = items.filter((item) => {
		if (target.kind && item.kind !== target.kind) return false;
		if (target.agent && !settingSupportsAgent(item, target.agent)) return false;
		if (target.name && item.name !== target.name) return false;
		if (target.description && item.description !== target.description) {
			return false;
		}
		if (
			target.sourcePath &&
			enabledPathFor(item.sourcePath) !== enabledPathFor(target.sourcePath)
		) {
			return false;
		}
		return true;
	});

	return candidates.length === 1 ? candidates[0] : null;
}

function settingSupportsAgent(
	item: AgentSettingsItem,
	agent: AgentSettingsAgent,
) {
	return item.agent === agent || item.agents?.includes(agent) === true;
}

async function setAgentSettingItemEnabled(
	item: AgentSettingsItem,
	enabled: boolean,
) {
	if (item.enabledByDefault === enabled) return [];

	if (item.kind === "hook") {
		return setHookEnabled(item, enabled);
	}

	return setFileBackedSettingEnabled(item, enabled);
}

async function setFileBackedSettingEnabled(
	item: AgentSettingsItem,
	enabled: boolean,
) {
	const activePath = enabledPathFor(item.sourcePath);
	const disabledPath = disabledPathFor(activePath);
	const fromPath = enabled ? disabledPath : activePath;
	const toPath = enabled ? activePath : disabledPath;

	if (!(await fileExists(fromPath))) {
		throw new Error(`변경할 설정 파일을 찾지 못했습니다: ${fromPath}`);
	}
	if (await fileExists(toPath)) {
		throw new Error(`대상 파일이 이미 있습니다: ${toPath}`);
	}

	await fs.rename(fromPath, toPath);
	return [activePath, disabledPath];
}

async function setHookEnabled(item: AgentSettingsItem, enabled: boolean) {
	const hooksFilePath = item.sourcePath;
	const sidecarPath = disabledHooksSidecarPath(hooksFilePath);
	const config = (await readJson<HooksConfig>(hooksFilePath)) ?? {};
	const sidecar = await readDisabledHooksSidecar(hooksFilePath);

	if (enabled) {
		const entry = sidecar.disabled.find(
			(candidate) => candidate.id === item.id,
		);
		if (!entry) return [];
		config.hooks ??= {};
		config.hooks[entry.phase] ??= [];
		config.hooks[entry.phase].splice(
			entry.index ?? config.hooks[entry.phase].length,
			0,
			entry.hook,
		);
		sidecar.disabled = sidecar.disabled.filter(
			(candidate) => candidate.id !== item.id,
		);
		await writeJson(hooksFilePath, { hooks: config.hooks });
		await writeJson(sidecarPath, sidecar);
		return [hooksFilePath, sidecarPath];
	}

	const found = findHookEntry(config, item.id, hooksFilePath, item.agent);
	if (!found) return [];
	const [removed] = found.hooks.splice(found.index, 1);
	if (found.hooks.length === 0) {
		delete config.hooks?.[found.phase];
	}
	sidecar.disabled.push({
		hook: removed,
		id: item.id,
		index: found.index,
		phase: found.phase,
	});
	await writeJson(hooksFilePath, { hooks: config.hooks ?? {} });
	await writeJson(sidecarPath, sidecar);
	return [hooksFilePath, sidecarPath];
}

async function readAgentsSkills() {
	const skillFiles = await findSkillFiles(path.join(agentsHome(), "skills"), 3);
	return Promise.all(
		skillFiles.map((filePath) =>
			readSkillFile(filePath, {
				agent: "claude",
				project: "personal",
				scope: "personal",
				sourceRoot: path.join(agentsHome(), "skills"),
			}),
		),
	);
}

async function readCodexSkills() {
	const skillFiles = await findSkillFiles(path.join(codexHome(), "skills"), 4);
	return Promise.all(
		skillFiles.map((filePath) =>
			readSkillFile(filePath, {
				agent: "codex",
				project: "personal",
				scope: "personal",
				sourceRoot: path.join(codexHome(), "skills"),
			}),
		),
	);
}

export async function readSkillFile(
	filePath: string,
	options: {
		agent: AgentSettingsAgent;
		agents?: AgentSettingsAgent[];
		project: AgentSettingsProject;
		scope: AgentSettingsScope;
		sourceRoot: string;
	},
): Promise<AgentSettingsItem> {
	const content = await safeReadText(filePath);
	const directoryName = path.basename(path.dirname(filePath));
	const frontmatter = parseFrontmatter(content);
	const activePath = enabledPathFor(filePath);
	const relativePath = path.relative(options.sourceRoot, activePath);
	const name = humanizeName(frontmatter.name || directoryName);
	const description =
		frontmatter.description || getFirstMeaningfulLine(content) || "설명 없음";

	return {
		id: itemId(options.agent, "skill", relativePath || filePath),
		agent: options.agent,
		agents: options.agents,
		kind: "skill",
		name,
		description,
		project: options.project,
		scope: options.scope,
		sourcePath: filePath,
		writePaths: [activePath, disabledPathFor(activePath)],
		enabledByDefault: isEnabledPath(filePath),
	};
}

async function readAgentRules() {
	const rulesDir = path.join(agentsHome(), "rules");
	const meta = await readJson<Record<string, RuleMeta>>(
		path.join(agentsHome(), "rules-meta.json"),
	);
	const ruleFiles = await findRuleFiles(rulesDir, [".md"], 1);

	return Promise.all(
		ruleFiles.map(async (filePath) => {
			const activePath = enabledPathFor(filePath);
			const slug = path.basename(activePath, ".md");
			const content = await safeReadText(filePath);
			const ruleMeta = meta?.[slug];
			const description =
				ruleMeta?.description || getFirstMeaningfulLine(content) || "설명 없음";
			const condition = ruleMeta?.globs ? ` 적용 범위: ${ruleMeta.globs}` : "";

			return {
				id: itemId("claude", "rule", slug),
				agent: "claude",
				kind: "rule",
				name: humanizeName(slug),
				description: `${description}${condition}`,
				project: "personal",
				scope: "personal",
				sourcePath: filePath,
				writePaths: [activePath, disabledPathFor(activePath)],
				enabledByDefault: isEnabledPath(filePath),
			} satisfies AgentSettingsItem;
		}),
	);
}

async function readProjectAgentConfigs() {
	const items = await Promise.all(
		projectSources().map(async ({ project, root }) => {
			const sources = getProjectAgentConfigSources(root);
			const rules = await Promise.all(
				sources.ruleDirs.map((rulesDir) => {
					const agents = getProjectAgentTargets(root, rulesDir);
					return readProjectRules(rulesDir, project, {
						agents,
						metaPath: path.join(path.dirname(rulesDir), "rules-meta.json"),
					});
				}),
			);
			const skills = await Promise.all(
				sources.skillDirs.map(async (skillDir) => {
					const skillFiles = await findSkillFiles(skillDir, 3);
					return Promise.all(
						skillFiles.map((filePath) => {
							const agents = getProjectAgentTargets(root, filePath);
							return readSkillFile(filePath, {
								agent: agents[0],
								agents,
								project,
								scope: "project",
								sourceRoot: skillDir,
							});
						}),
					);
				}),
			);
			const hooks = await Promise.all(
				sources.hookFiles.map((hookFile) => {
					const agents = getProjectAgentTargets(root, hookFile);
					return readHooks(hookFile, agents[0], project, "project", agents);
				}),
			);

			return [...rules.flat(), ...skills.flat(), ...hooks.flat()];
		}),
	);

	return items.flat();
}

export async function readProjectRules(
	rulesDir: string,
	project: Exclude<AgentSettingsProject, "personal">,
	options: { agents: AgentSettingsAgent[]; metaPath: string },
) {
	const meta = await readJson<Record<string, RuleMeta>>(options.metaPath);
	const ruleFiles = await findRuleFiles(rulesDir, [".md", ".mdc"], 1);

	return Promise.all(
		ruleFiles.map(async (filePath) => {
			const activePath = enabledPathFor(filePath);
			const slug = path.basename(activePath, path.extname(activePath));
			const content = await safeReadText(filePath);
			const ruleMeta = meta?.[slug];
			const description =
				ruleMeta?.description || getFirstMeaningfulLine(content) || "설명 없음";
			const condition = ruleMeta?.globs ? ` 적용 범위: ${ruleMeta.globs}` : "";

			return {
				id: itemId(options.agents.join("-"), "rule", activePath),
				agent: options.agents[0],
				agents: options.agents,
				kind: "rule",
				name: humanizeName(slug),
				description: `${description}${condition}`,
				project,
				scope: "project",
				sourcePath: filePath,
				writePaths: [activePath, disabledPathFor(activePath)],
				enabledByDefault: isEnabledPath(filePath),
			} satisfies AgentSettingsItem;
		}),
	);
}

async function readCodexRules() {
	const files = [
		...projectSources().map(({ project, root }) => ({
			filePath: path.join(root, "AGENTS.md"),
			project,
			scope: "project" as const,
			name: "Project AGENTS",
		})),
		{
			filePath: path.join(codexHome(), "AGENTS.md"),
			project: "personal" as const,
			scope: "personal" as const,
			name: "Codex AGENTS",
		},
		{
			filePath: path.join(codexHome(), "instructions.md"),
			project: "personal" as const,
			scope: "personal" as const,
			name: "Codex Instructions",
		},
	];
	const existing = await Promise.all(
		files.map(async (entry) => {
			const filePath = await existingActiveOrDisabledPath(entry.filePath);
			return filePath ? { ...entry, filePath } : null;
		}),
	);

	return Promise.all(
		existing.filter(isPresent).map(async (entry) => {
			const activePath = enabledPathFor(entry.filePath);
			const content = await safeReadText(entry.filePath);
			return {
				id: itemId("codex", "rule", activePath),
				agent: "codex",
				kind: "rule",
				name: entry.name,
				description:
					getFirstMeaningfulLine(content) ||
					"Codex가 세션 시작 시 참조하는 지침 파일입니다.",
				project: entry.project,
				scope: entry.scope,
				sourcePath: entry.filePath,
				writePaths: [activePath, disabledPathFor(activePath)],
				enabledByDefault: isEnabledPath(entry.filePath),
			} satisfies AgentSettingsItem;
		}),
	);
}

async function readCursorRules() {
	const candidates = [
		...projectSources().map(({ project, root }) => ({
			filePath: path.join(root, ".cursorrules"),
			project,
			scope: "project" as const,
		})),
		{
			filePath: path.join(homeDir(), ".cursorrules"),
			project: "personal" as const,
			scope: "personal" as const,
		},
	] as const;
	const cursorRuleFiles = [
		...(
			await Promise.all(
				projectSources().map(({ root }) =>
					findRuleFiles(path.join(root, ".cursor", "rules"), [".mdc"], 2),
				),
			)
		).flat(),
		...(await findRuleFiles(
			path.join(homeDir(), ".cursor", "rules"),
			[".mdc"],
			2,
		)),
	];
	const candidateItems = await Promise.all(
		candidates.map(async ({ filePath, project, scope }) => {
			const existingPath = await existingActiveOrDisabledPath(filePath);
			if (!existingPath) return null;
			const activePath = enabledPathFor(existingPath);
			const content = await safeReadText(existingPath);
			return {
				id: itemId("cursor", "rule", activePath),
				agent: "cursor",
				kind: "rule",
				name: path.basename(activePath),
				description:
					getFirstMeaningfulLine(content) ||
					"Cursor가 참조하는 프로젝트/개인 룰 파일입니다.",
				project,
				scope,
				sourcePath: existingPath,
				writePaths: [activePath, disabledPathFor(activePath)],
				enabledByDefault: isEnabledPath(existingPath),
			} satisfies AgentSettingsItem;
		}),
	);
	const ruleItems = await Promise.all(
		cursorRuleFiles.map(async (filePath) => {
			const activePath = enabledPathFor(filePath);
			const content = await safeReadText(filePath);
			const project = projectForPath(filePath);
			const scope = project === "personal" ? "personal" : "project";
			return {
				id: itemId("cursor", "rule", activePath),
				agent: "cursor",
				kind: "rule",
				name: humanizeName(path.basename(activePath, ".mdc")),
				description:
					getFirstMeaningfulLine(content) ||
					"Cursor rules 디렉터리에 설치된 룰입니다.",
				project,
				scope,
				sourcePath: filePath,
				writePaths: [activePath, disabledPathFor(activePath)],
				enabledByDefault: isEnabledPath(filePath),
			} satisfies AgentSettingsItem;
		}),
	);

	return [...candidateItems.filter(isPresent), ...ruleItems];
}

async function readGeminiRules() {
	const candidates = [
		...projectSources().map(({ project, root }) => ({
			filePath: path.join(root, "GEMINI.md"),
			project,
			scope: "project" as const,
		})),
		{
			filePath: path.join(homeDir(), ".gemini", "GEMINI.md"),
			project: "personal" as const,
			scope: "personal",
		},
		{
			filePath: path.join(homeDir(), "GEMINI.md"),
			project: "personal" as const,
			scope: "personal",
		},
	] as const;

	const items = await Promise.all(
		candidates.map(async ({ filePath, project, scope }) => {
			const existingPath = await existingActiveOrDisabledPath(filePath);
			if (!existingPath) return null;
			const activePath = enabledPathFor(existingPath);
			const content = await safeReadText(existingPath);
			return {
				id: itemId("gemini", "rule", activePath),
				agent: "gemini",
				kind: "rule",
				name: path.basename(activePath),
				description:
					getFirstMeaningfulLine(content) ||
					"Gemini CLI가 참조하는 프로젝트/개인 지침 파일입니다.",
				project,
				scope,
				sourcePath: existingPath,
				writePaths: [activePath, disabledPathFor(activePath)],
				enabledByDefault: isEnabledPath(existingPath),
			} satisfies AgentSettingsItem;
		}),
	);

	return items.filter(isPresent);
}

export async function readHooks(
	hooksFilePath: string,
	agent: AgentSettingsAgent,
	project: AgentSettingsProject = "personal",
	scope: AgentSettingsScope = "personal",
	agents?: AgentSettingsAgent[],
) {
	const config = await readJson<HooksConfig>(hooksFilePath);
	const sidecar = await readDisabledHooksSidecar(hooksFilePath);
	const activeItems = Object.entries(config?.hooks ?? {}).flatMap(
		([phase, hooks]) =>
			hooks.map((hook) =>
				buildHookItem({
					agent,
					agents,
					enabled: true,
					hook,
					hooksFilePath,
					phase,
					project,
					scope,
				}),
			),
	);
	const disabledItems = sidecar.disabled.map((entry) =>
		buildHookItem({
			agent,
			agents,
			enabled: false,
			hook: entry.hook,
			hooksFilePath,
			id: entry.id,
			phase: entry.phase,
			project,
			scope,
		}),
	);

	return [...activeItems, ...disabledItems];
}

async function findFiles(
	root: string,
	targetNameOrExtension: string,
	maxDepth: number,
) {
	const results: string[] = [];

	async function walk(directory: string, depth: number) {
		if (depth > maxDepth) return;
		let entries: Dirent[];
		try {
			entries = await fs.readdir(directory, { withFileTypes: true });
		} catch {
			return;
		}

		await Promise.all(
			entries.map(async (entry) => {
				const entryPath = path.join(directory, entry.name);
				if (entry.isDirectory()) {
					await walk(entryPath, depth + 1);
					return;
				}
				if (
					entry.name === targetNameOrExtension ||
					entry.name.endsWith(targetNameOrExtension)
				) {
					results.push(entryPath);
				}
			}),
		);
	}

	await walk(root, 0);
	return results;
}

async function findSkillFiles(root: string, maxDepth: number) {
	return [
		...(await findFiles(root, "SKILL.md", maxDepth)),
		...(await findFiles(root, "SKILL.md.disabled", maxDepth)),
	];
}

async function findRuleFiles(
	root: string,
	extensions: string[],
	maxDepth: number,
) {
	const files = await Promise.all(
		extensions.flatMap((extension) => [
			findFiles(root, extension, maxDepth),
			findFiles(root, `${extension}.disabled`, maxDepth),
		]),
	);
	return files.flat();
}

async function safeReadText(filePath: string) {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch {
		return "";
	}
}

async function readJson<T>(filePath: string) {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
	} catch {
		return null;
	}
}

async function writeJson(filePath: string, data: unknown) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function fileExists(filePath: string) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function existingActiveOrDisabledPath(filePath: string) {
	if (await fileExists(filePath)) return filePath;
	const disabledPath = disabledPathFor(filePath);
	return (await fileExists(disabledPath)) ? disabledPath : null;
}

function isEnabledPath(filePath: string) {
	return !filePath.endsWith(".disabled");
}

function enabledPathFor(filePath: string) {
	return filePath.endsWith(".disabled")
		? filePath.slice(0, -".disabled".length)
		: filePath;
}

function disabledPathFor(filePath: string) {
	return `${enabledPathFor(filePath)}.disabled`;
}

function disabledHooksSidecarPath(hooksFilePath: string) {
	return `${hooksFilePath}.my-workbench-disabled.json`;
}

async function readDisabledHooksSidecar(
	hooksFilePath: string,
): Promise<DisabledHooksSidecar> {
	const sidecar = await readJson<DisabledHooksSidecar>(
		disabledHooksSidecarPath(hooksFilePath),
	);
	if (!sidecar || !Array.isArray(sidecar.disabled)) {
		return { version: 1, disabled: [] };
	}
	return { version: 1, disabled: sidecar.disabled };
}

function buildHookItem({
	agent,
	agents,
	enabled,
	hook,
	hooksFilePath,
	id,
	phase,
	project,
	scope,
}: {
	agent: AgentSettingsAgent;
	agents?: AgentSettingsAgent[];
	enabled: boolean;
	hook: HookConfigEntry;
	hooksFilePath: string;
	id?: string;
	phase: string;
	project: AgentSettingsProject;
	scope: AgentSettingsScope;
}) {
	const command = hook.command || "unknown command";
	const name = humanizeName(path.basename(command, path.extname(command)));
	const matcher = hook.matcher ? ` matcher: ${hook.matcher}.` : "";
	const timeout = hook.timeout ? ` timeout: ${hook.timeout}s.` : "";

	return {
		id: id ?? hookItemId(agent, hooksFilePath, phase, hook),
		agent,
		agents,
		kind: "hook",
		name,
		description: `${phase} 단계에서 실행됩니다.${matcher}${timeout}`,
		project,
		scope,
		sourcePath: hooksFilePath,
		writePaths: [hooksFilePath, disabledHooksSidecarPath(hooksFilePath)],
		enabledByDefault: enabled,
	} satisfies AgentSettingsItem;
}

function findHookEntry(
	config: HooksConfig,
	id: string,
	hooksFilePath: string,
	agent: AgentSettingsAgent,
) {
	for (const [phase, hooks] of Object.entries(config.hooks ?? {})) {
		const index = hooks.findIndex(
			(hook) => hookItemId(agent, hooksFilePath, phase, hook) === id,
		);
		if (index >= 0) return { hooks, index, phase };
	}
	return null;
}

function hookItemId(
	agent: AgentSettingsAgent,
	hooksFilePath: string,
	phase: string,
	hook: HookConfigEntry,
) {
	return itemId(
		agent,
		"hook",
		JSON.stringify([
			hooksFilePath,
			phase,
			hook.command ?? "",
			hook.matcher ?? "",
			hook.timeout ?? null,
		]),
	);
}

function parseFrontmatter(content: string) {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!frontmatterMatch) return {};

	const lines = frontmatterMatch[1].split("\n");
	let name: string | undefined;
	let description: string | undefined;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const nameMatch = line.match(/^name:\s*(.+?)\s*$/);
		if (nameMatch) {
			name = stripYamlValue(nameMatch[1]);
			continue;
		}

		const descriptionMatch = line.match(/^description:\s*(.*?)\s*$/);
		if (!descriptionMatch) continue;

		const rawDescription = stripYamlValue(descriptionMatch[1]);
		if (["|", "|-", ">", ">-"].includes(rawDescription)) {
			const blockLines: string[] = [];
			for (
				let blockIndex = index + 1;
				blockIndex < lines.length;
				blockIndex += 1
			) {
				const blockLine = lines[blockIndex];
				if (blockLine && !/^\s/.test(blockLine)) break;
				const trimmed = blockLine.trim();
				if (!trimmed && blockLines.length > 0) break;
				if (trimmed) blockLines.push(trimmed);
			}
			description = blockLines.join(" ");
		} else {
			description = rawDescription;
		}
	}

	return { name, description };
}

function stripYamlValue(value: string) {
	return value.trim().replace(/^["']|["']$/g, "");
}

function buildDetailMarkdown(item: AgentSettingsItem, raw: string) {
	if (!raw.trim()) {
		return `# ${item.name}\n\n${item.description}\n\n내용을 읽지 못했습니다.`;
	}

	if (isMarkdownLikeSource(item.sourcePath)) {
		return raw;
	}

	const extension = path.extname(item.sourcePath).replace(".", "") || "text";
	return [
		`# ${item.name}`,
		"",
		item.description,
		"",
		"## 메타데이터",
		"",
		`- 에이전트: ${item.agent}`,
		`- 유형: ${item.kind}`,
		`- 프로젝트: ${item.project}`,
		`- 범위: ${item.scope}`,
		`- 경로: ${item.sourcePath}`,
		"",
		"## 원본",
		"",
		`\`\`\`${extension}`,
		raw.trim(),
		"```",
	].join("\n");
}

function isMarkdownLikeSource(filePath: string) {
	const basename = path.basename(filePath).toLowerCase();
	return (
		filePath.endsWith(".md") ||
		filePath.endsWith(".mdc") ||
		basename === "agents.md" ||
		basename === "gemini.md"
	);
}

function getFirstMeaningfulLine(content: string) {
	return content
		.replace(/^---\n[\s\S]*?\n---/, "")
		.split("\n")
		.map((line) => line.replace(/^#+\s*/, "").trim())
		.find((line) => line && !line.startsWith("<!--"));
}

function humanizeName(value: string) {
	return value
		.replace(/[-_.]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toLocaleUpperCase());
}

export function getProjectAgentConfigSources(root: string) {
	return {
		ruleDirs: [
			path.join(root, "rules"),
			path.join(root, ".agents", "rules"),
			path.join(root, "agents-config", "rules"),
		],
		skillDirs: [
			path.join(root, "skills"),
			path.join(root, ".agents", "skills"),
			path.join(root, "agents-config", "skills"),
		],
		hookFiles: [
			path.join(root, ".agents", "hooks.json"),
			path.join(root, "agents-config", "hooks.json"),
		],
	};
}

export function getProjectAgentTargets(
	root: string,
	sourcePath: string,
): AgentSettingsAgent[] {
	const relativePath = path.relative(root, sourcePath);
	const firstSegment = relativePath.split(path.sep)[0];

	if (firstSegment === "agents-config") return ["codex", "claude", "cursor"];
	if (firstSegment === ".agents" || firstSegment === ".claude") {
		return ["claude"];
	}
	if (firstSegment === ".cursor") return ["cursor"];
	return ["claude", "cursor"];
}

function projectForPath(filePath: string): AgentSettingsProject {
	const source = projectSources().find(({ root }) => {
		return filePath === root || filePath.startsWith(`${root}${path.sep}`);
	});
	return source?.project ?? "personal";
}

function itemId(agent: string, kind: string, value: string) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `${agent}-${kind}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function isPresent<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
