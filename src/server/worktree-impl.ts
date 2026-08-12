import { exec as cbExec } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseIssueTitle } from "#/lib/tasks/parse-issue-title";
import { parseTaskMarkdown } from "#/lib/tasks/parser";
import {
	type AssociatedPlanInfo,
	parsePlanProgress,
	type WorktreeConfig,
	type WorktreeInfo,
	type WorktreeType,
} from "#/lib/worktree";
import { getPlansDir, TASKS_FILE } from "#/server/paths";
import {
	getDefaultWorktreeConfig,
	WORKTREE_CONFIG_FILE,
} from "#/server/worktree-utils";

const exec = promisify(cbExec);

function getCommandErrorMessage(error: unknown, fallback: string) {
	if (error && typeof error === "object") {
		const maybeCommandError = error as { stderr?: unknown; message?: unknown };
		if (
			typeof maybeCommandError.stderr === "string" &&
			maybeCommandError.stderr
		) {
			return maybeCommandError.stderr;
		}
		if (
			typeof maybeCommandError.message === "string" &&
			maybeCommandError.message
		) {
			return maybeCommandError.message;
		}
	}
	return fallback;
}

export { WORKTREE_CONFIG_FILE } from "#/server/worktree-utils";

function expandHome(input: string): string {
	return input.startsWith("~/")
		? path.join(os.homedir(), input.slice(2))
		: input;
}

export function getWorktreeType(
	wtPath: string,
	repoPath: string,
): WorktreeType {
	const normalizedWtPath = path.resolve(wtPath);
	const normalizedRepoPath = path.resolve(repoPath);
	const basename = path.basename(wtPath);

	if (normalizedWtPath === normalizedRepoPath) {
		return "main";
	}

	if (wtPath.includes(".claude") || basename.includes("claude-")) {
		return "claude";
	}

	if (wtPath.includes(".codex") || basename.includes("codex-")) {
		return "codex";
	}

	if (
		wtPath.includes(".gemini") ||
		wtPath.includes("antigravity") ||
		wtPath.includes(".system_generated") ||
		basename.includes("antigravity-")
	) {
		return "antigravity";
	}

	return "developer";
}

export async function ensureConfig(): Promise<WorktreeConfig> {
	const defaultConfig = getDefaultWorktreeConfig();

	try {
		const content = await fs.readFile(WORKTREE_CONFIG_FILE, "utf8");
		return normalizeConfig(JSON.parse(content), defaultConfig);
	} catch {
		return defaultConfig;
	}
}

function normalizeConfig(
	value: unknown,
	defaultConfig: WorktreeConfig,
): WorktreeConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return defaultConfig;
	}

	const config = value as Partial<WorktreeConfig>;
	const scanRoots = Array.isArray(config.scanRoots)
		? Array.from(
				new Set(
					config.scanRoots
						.filter((root): root is string => typeof root === "string")
						.map((root) => root.trim())
						.filter(Boolean),
				),
			)
		: defaultConfig.scanRoots;
	const savedDefaultDir =
		typeof config.defaultWorktreeDir === "string"
			? config.defaultWorktreeDir.trim()
			: "";

	return {
		scanRoots,
		defaultWorktreeDir: savedDefaultDir || defaultConfig.defaultWorktreeDir,
	};
}

async function scanGitRepositories(scanRoots: string[]): Promise<string[]> {
	const repos: string[] = [];
	for (const root of scanRoots) {
		const expandedRoot = expandHome(root);
		try {
			const entries = await fs.readdir(expandedRoot, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory()) {
					const projectPath = path.join(expandedRoot, entry.name);
					const gitPath = path.join(projectPath, ".git");
					try {
						const gitStat = await fs.stat(gitPath);
						if (gitStat.isDirectory()) {
							repos.push(projectPath);
						}
					} catch {
						// No .git folder
					}
				}
			}
		} catch (err) {
			console.error(`Failed to scan root: ${expandedRoot}`, err);
		}
	}
	return repos;
}

export async function getWorktreesImpl() {
	const config = await ensureConfig();
	const repos = await scanGitRepositories(config.scanRoots);

	const issueMap = new Map<string, { title: string; section: string }>();
	try {
		const tasksContent = await fs.readFile(TASKS_FILE, "utf8");
		const board = parseTaskMarkdown(tasksContent);
		for (const [sectionId, tasks] of Object.entries(board.tasks)) {
			const sectionName =
				board.sections.find((s) => s.id === sectionId)?.name || sectionId;
			for (const task of tasks) {
				const parsed = parseIssueTitle(task.title);
				if (parsed.issueKey) {
					issueMap.set(parsed.issueKey, {
						title: parsed.summary,
						section: sectionName,
					});
				}
			}
		}
	} catch (err) {
		console.error("Failed to load TASKS.md for worktree mapping", err);
	}

	// 레포지토리별 스캔을 병렬 처리하여 최초 로딩 지연 최소화
	const repoResults = await Promise.all(
		repos.map((repoPath) => scanRepoWorktrees(repoPath, issueMap)),
	);

	const worktreeList: WorktreeInfo[] = [];
	const seenPaths = new Set<string>();
	for (const repoWorktrees of repoResults) {
		for (const wt of repoWorktrees) {
			const normalizedPath = path.resolve(wt.path);
			if (seenPaths.has(normalizedPath)) continue;
			seenPaths.add(normalizedPath);
			worktreeList.push(wt);
		}
	}

	return {
		worktrees: worktreeList,
		config,
	};
}

async function scanRepoWorktrees(
	repoPath: string,
	issueMap: Map<string, { title: string; section: string }>,
): Promise<WorktreeInfo[]> {
	const repoName = path.basename(repoPath);
	try {
		const { stdout } = await exec("git worktree list", { cwd: repoPath });
		const lines = stdout
			.trim()
			.split("\n")
			.filter((line) => line.trim());

		// 워크트리별 상태 조회(git log/status)도 병렬 처리
		const results = await Promise.all(
			lines.map((line) =>
				buildWorktreeInfo(line, repoPath, repoName, issueMap),
			),
		);
		return results.filter((wt): wt is WorktreeInfo => wt !== null);
	} catch (err) {
		console.error(`Failed to get worktrees for repository: ${repoPath}`, err);
		return [];
	}
}

async function buildWorktreeInfo(
	line: string,
	repoPath: string,
	repoName: string,
	issueMap: Map<string, { title: string; section: string }>,
): Promise<WorktreeInfo | null> {
	const parts = line.split(/\s+/);
	if (parts.length < 2) return null;

	const wtPath = parts[0];
	const commitHash = parts[1];

	let branch = "";
	if (parts[2]) {
		if (parts[2].startsWith("[") && parts[2].endsWith("]")) {
			branch = parts[2].slice(1, -1);
		} else if (line.includes("(detached HEAD")) {
			branch = "(detached)";
		} else {
			branch = parts.slice(2).join(" ");
		}
	} else {
		branch = "(detached)";
	}

	// 커밋 메시지와 Dirty 상태를 병렬로 조회
	const [commitMessage, dirtyState] = await Promise.all([
		exec("git log -1 --format=%s", { cwd: wtPath })
			.then(({ stdout }) => stdout.trim())
			.catch(() => "N/A"),
		exec("git status --short", { cwd: wtPath })
			.then(({ stdout }) => {
				const statusLines = stdout.trim().split("\n").filter(Boolean);
				return {
					isDirty: statusLines.length > 0,
					dirtyCount: statusLines.length,
				};
			})
			.catch(() => ({ isDirty: false, dirtyCount: 0 })),
	]);

	const type = getWorktreeType(wtPath, repoPath);

	const issueRegex = /([A-Z]+-\d+)/i;
	const pathMatch = path.basename(wtPath).match(issueRegex);
	const branchMatch = branch.match(issueRegex);
	const matchedIssueKey = (branchMatch?.[1] || pathMatch?.[1])?.toUpperCase();

	const issueKey: string | undefined = matchedIssueKey;
	let issueTitle: string | undefined;

	if (matchedIssueKey) {
		const mapped = issueMap.get(matchedIssueKey);
		if (mapped) {
			issueTitle = `${mapped.title} (${mapped.section})`;
		}
	}

	let associatedPlan: AssociatedPlanInfo | undefined;
	if (matchedIssueKey) {
		const planDir = path.join(getPlansDir(), matchedIssueKey);
		const planFile = path.join(planDir, "plan.md");
		try {
			const planContent = await fs.readFile(planFile, "utf8");
			const parsedProgress = parsePlanProgress(planContent);

			associatedPlan = {
				taskId: matchedIssueKey,
				...parsedProgress,
			};
		} catch {
			// Plan not found
		}
	}

	return {
		path: wtPath,
		commitHash,
		branch,
		repoName,
		repoPath,
		commitMessage,
		isDirty: dirtyState.isDirty,
		dirtyCount: dirtyState.dirtyCount,
		type,
		issueKey,
		issueTitle,
		associatedPlan,
	};
}

export async function getBranchesImpl(repoPath: string) {
	try {
		const { stdout } = await exec('git branch -a --format="%(refname:short)"', {
			cwd: repoPath,
		});
		const branches = stdout
			.trim()
			.split("\n")
			.map((b) => b.trim().replace(/^"/, "").replace(/"$/, ""))
			.filter(Boolean);

		const uniqueBranches = Array.from(
			new Set(
				branches
					.map((b) =>
						b.startsWith("remotes/") ? b.replace("remotes/", "") : b,
					)
					.filter((b) => !b.includes("/HEAD")),
			),
		);

		return { branches: uniqueBranches };
	} catch (err) {
		console.error(`Failed to get branches for repo: ${repoPath}`, err);
		return { branches: [] };
	}
}

export async function createWorktreeImpl(data: {
	repoPath: string;
	branchName: string;
	isNew: boolean;
	baseBranch?: string;
	customPath?: string;
}) {
	const config = await ensureConfig();
	const repoName = path.basename(data.repoPath);

	let targetPath = data.customPath;
	if (!targetPath) {
		const sanitizedBranch = data.branchName.replace(/[^a-zA-Z0-9-_]/g, "_");
		targetPath = path.join(
			expandHome(config.defaultWorktreeDir),
			`${repoName}-wt-${sanitizedBranch}`,
		);
	} else {
		targetPath = expandHome(targetPath);
	}

	try {
		let command = "";
		if (data.isNew) {
			const base = data.baseBranch ? ` ${data.baseBranch}` : "";
			command = `git worktree add "${targetPath}" -b "${data.branchName}"${base}`;
		} else {
			command = `git worktree add "${targetPath}" "${data.branchName}"`;
		}

		await exec(command, { cwd: data.repoPath });
		return { ok: true as const, path: targetPath };
	} catch (err) {
		console.error("Failed to create git worktree:", err);
		throw new Error(getCommandErrorMessage(err, "Unknown error occurred"));
	}
}

export async function removeWorktreeImpl(data: {
	path: string;
	force?: boolean;
}) {
	try {
		const forceFlag = data.force ? " --force" : "";
		await exec(`git worktree remove "${data.path}"${forceFlag}`);
		return { ok: true as const };
	} catch (err) {
		console.error("Failed to remove git worktree:", err);
		throw new Error(getCommandErrorMessage(err, "Unknown error occurred"));
	}
}

export async function openInToolImpl(data: {
	path: string;
	tool: "cursor" | "claude" | "codex" | "antigravity";
}) {
	const escapedPath = data.path.replace(/"/g, '\\"');

	try {
		if (data.tool === "cursor") {
			await exec(`cursor "${escapedPath}"`);
			return { ok: true as const };
		} else {
			let commandToRun = "";
			if (data.tool === "claude") {
				commandToRun = "claude";
			} else if (data.tool === "codex") {
				commandToRun = "codex";
			} else if (data.tool === "antigravity") {
				commandToRun = "antigravity";
			}

			if (commandToRun) {
				const scriptLines = [
					'tell application "Terminal"',
					"activate",
					`do script "cd \\"${escapedPath}\\" && ${commandToRun}"`,
					"end tell",
				];
				const args = scriptLines
					.map((line) => `-e ${JSON.stringify(line)}`)
					.join(" ");
				await exec(`osascript ${args}`);
				return { ok: true as const };
			}
		}
		return { ok: false as const, error: "Unsupported tool" };
	} catch (err) {
		console.error(`Failed to open path in ${data.tool}:`, err);
		throw new Error(getCommandErrorMessage(err, `Failed to run ${data.tool}`));
	}
}
