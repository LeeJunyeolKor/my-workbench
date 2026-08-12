import { exec as cbExec } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { BranchScanEntry } from "#/lib/branch-links";
import type { WorktreeConfig } from "#/lib/worktree";
import { ensureConfig } from "#/server/worktree-impl";

const exec = promisify(cbExec);

function expandHome(input: string): string {
	return input.startsWith("~/")
		? path.join(os.homedir(), input.slice(2))
		: input;
}

async function scanGitRepositories(scanRoots: string[]): Promise<string[]> {
	const repos: string[] = [];
	for (const root of scanRoots) {
		const expandedRoot = expandHome(root);
		try {
			const entries = await fs.readdir(expandedRoot, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const projectPath = path.join(expandedRoot, entry.name);
				try {
					const gitStat = await fs.stat(path.join(projectPath, ".git"));
					if (gitStat.isDirectory()) repos.push(projectPath);
				} catch {
					// Not a primary git checkout.
				}
			}
		} catch (error) {
			console.error(`Failed to scan branch root: ${expandedRoot}`, error);
		}
	}
	return repos;
}

async function listBranches(
	repoPath: string,
	source: BranchScanEntry["source"],
): Promise<string[]> {
	const command =
		source === "local"
			? 'git branch --format="%(refname:short)"'
			: 'git branch -r --format="%(refname:short)"';
	try {
		const { stdout } = await exec(command, { cwd: repoPath });
		return stdout
			.split("\n")
			.map((line) => line.trim().replace(/^"/, "").replace(/"$/, ""))
			.filter((line) => line && !line.includes("/HEAD"));
	} catch (error) {
		console.error(`Failed to list ${source} branches for ${repoPath}`, error);
		return [];
	}
}

async function scanRepoBranches(repoPath: string): Promise<BranchScanEntry[]> {
	const repoName = path.basename(repoPath);
	const [localBranches, remoteBranches] = await Promise.all([
		listBranches(repoPath, "local"),
		listBranches(repoPath, "remote"),
	]);

	return [
		...localBranches.map((branch) => ({
			repoName,
			repoPath,
			branch,
			source: "local" as const,
		})),
		...remoteBranches.map((branch) => ({
			repoName,
			repoPath,
			branch,
			source: "remote" as const,
			remoteName: branch.split("/")[0] || undefined,
		})),
	];
}

export async function getConfiguredBranches(
	config?: WorktreeConfig,
): Promise<BranchScanEntry[]> {
	const worktreeConfig = config ?? (await ensureConfig());
	const repos = await scanGitRepositories(worktreeConfig.scanRoots);
	const perRepo = await Promise.all(repos.map(scanRepoBranches));
	return perRepo.flat();
}
