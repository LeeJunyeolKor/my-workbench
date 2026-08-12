import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempRoots: string[] = [];

async function loadWorktreeImpl(options: {
	content?: string;
	workspaceRoots?: string;
}) {
	const root = await fs.mkdtemp(
		path.join(os.tmpdir(), "my-workbench-worktrees-"),
	);
	tempRoots.push(root);
	vi.resetModules();
	vi.stubEnv("MY_WORKBENCH_DATA", root);
	vi.stubEnv("WORKBENCH_WORKSPACE_ROOTS", options.workspaceRoots ?? "");
	if (options.content !== undefined) {
		await fs.writeFile(
			path.join(root, "worktree_config.json"),
			options.content,
			"utf8",
		);
	}

	return { root, worktreeImpl: await import("./worktree-impl") };
}

describe("worktree config", () => {
	afterEach(async () => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		await Promise.all(
			tempRoots
				.splice(0)
				.map((root) => fs.rm(root, { force: true, recursive: true })),
		);
	});

	it("returns no scan roots when no workspace roots are configured", async () => {
		const { root, worktreeImpl } = await loadWorktreeImpl({});

		await expect(worktreeImpl.ensureConfig()).resolves.toEqual({
			scanRoots: [],
			defaultWorktreeDir: path.join(root, "worktrees"),
		});
		await expect(
			fs.stat(path.join(root, "worktree_config.json")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("uses only workspace roots explicitly provided by the environment", async () => {
		const firstRoot = "/workspace/one";
		const secondRoot = "/workspace/two";
		const { worktreeImpl } = await loadWorktreeImpl({
			workspaceRoots: [firstRoot, secondRoot, firstRoot].join(path.delimiter),
		});

		await expect(worktreeImpl.ensureConfig()).resolves.toEqual({
			scanRoots: [firstRoot, secondRoot],
			defaultWorktreeDir: firstRoot,
		});
	});

	it("ignores saved config values with the wrong shape", async () => {
		const { root, worktreeImpl } = await loadWorktreeImpl({
			content: JSON.stringify({
				scanRoots: "~/Projects",
				defaultWorktreeDir: 42,
			}),
		});

		await expect(worktreeImpl.ensureConfig()).resolves.toEqual({
			scanRoots: [],
			defaultWorktreeDir: path.join(root, "worktrees"),
		});
	});

	it("keeps an explicitly saved empty root list disabled", async () => {
		const { worktreeImpl } = await loadWorktreeImpl({
			content: JSON.stringify({
				scanRoots: [],
				defaultWorktreeDir: "/workspace/worktrees",
			}),
			workspaceRoots: "/workspace/from-env",
		});

		await expect(worktreeImpl.ensureConfig()).resolves.toEqual({
			scanRoots: [],
			defaultWorktreeDir: "/workspace/worktrees",
		});
	});
});
