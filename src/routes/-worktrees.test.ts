import { describe, expect, it } from "vitest";
import { worktreeCardClassName } from "./worktrees";

describe("worktreeCardClassName", () => {
	it("uses the shared surface treatment", () => {
		const className = worktreeCardClassName("border-blue-500/30");

		expect(className).toContain("bg-[var(--workbench-surface)]");
		expect(className).toContain("shadow-[var(--workbench-panel-shadow)]");
		expect(className).toContain("border-blue-500/30");
	});

	it("allows long branch and path text to shrink inside responsive grids", () => {
		expect(worktreeCardClassName()).toContain("min-w-0");
	});
});
