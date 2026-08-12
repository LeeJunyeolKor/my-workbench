import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempRoots: string[] = [];

async function loadPlanFileOrderWithStore(content: string) {
	const root = await fs.mkdtemp(
		path.join(os.tmpdir(), "my-workbench-plan-order-"),
	);
	tempRoots.push(root);
	vi.resetModules();
	vi.stubEnv("MY_WORKBENCH_DATA", root);
	await fs.writeFile(path.join(root, "plan_file_order.json"), content, "utf8");

	const module = await import("./plan-file-order");

	return { ...module, root };
}

describe("plan file order store", () => {
	afterEach(async () => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		await Promise.all(
			tempRoots
				.splice(0)
				.map((root) => fs.rm(root, { force: true, recursive: true })),
		);
	});

	it("normalizes a valid JSON store with the wrong shape", async () => {
		const { readPlanFileOrder } = await loadPlanFileOrderWithStore(
			JSON.stringify({
				"DEMO-2": "plan.md",
				"DEMO-3": ["plan.md", 123, null, "specs/api.md"],
			}),
		);

		await expect(readPlanFileOrder("DEMO-1")).resolves.toEqual([]);
		await expect(readPlanFileOrder("DEMO-2")).resolves.toEqual([]);
		await expect(readPlanFileOrder("DEMO-3")).resolves.toEqual([
			"plan.md",
			"specs/api.md",
		]);
	});
});
