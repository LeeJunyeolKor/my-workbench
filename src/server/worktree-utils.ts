import path from "node:path";
import type { WorktreeConfig, WorktreeType } from "#/lib/worktree";
import { WORKBENCH_DATA } from "#/server/paths";

export const WORKSPACE_ROOTS_ENV = "WORKBENCH_WORKSPACE_ROOTS";

export const WORKTREE_CONFIG_FILE = path.join(
	WORKBENCH_DATA,
	"worktree_config.json",
);

export function getEnvironmentWorkspaceRoots(
	env: NodeJS.ProcessEnv = process.env,
): string[] {
	const configuredRoots = env[WORKSPACE_ROOTS_ENV]?.trim();
	if (!configuredRoots) return [];

	return Array.from(
		new Set(
			configuredRoots
				.split(path.delimiter)
				.map((root) => root.trim())
				.filter(Boolean),
		),
	);
}

export function getDefaultWorktreeConfig(
	env: NodeJS.ProcessEnv = process.env,
): WorktreeConfig {
	const scanRoots = getEnvironmentWorkspaceRoots(env);
	return {
		scanRoots,
		defaultWorktreeDir: scanRoots[0] ?? path.join(WORKBENCH_DATA, "worktrees"),
	};
}

// 워크트리 유형 분류 헬퍼 함수 (서버 전용)
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
