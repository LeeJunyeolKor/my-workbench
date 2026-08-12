import { describe, expect, test } from "vitest";
import { shouldExpandPlanFolder } from "./tree-state";

describe("shouldExpandPlanFolder", () => {
	test("keeps unrelated folders collapsed by default", () => {
		expect(
			shouldExpandPlanFolder({
				folderPath: "archive",
				activePath: "pilot-plan.md",
				expandAllToken: 0,
			}),
		).toBe(false);
	});

	test("expands the folder that contains the active document", () => {
		expect(
			shouldExpandPlanFolder({
				folderPath: "archive/audits",
				activePath: "archive/audits/report.md",
				expandAllToken: 0,
			}),
		).toBe(true);
	});

	test("expands every folder after the expand-all signal changes", () => {
		expect(
			shouldExpandPlanFolder({
				folderPath: "research",
				activePath: "pilot-plan.md",
				expandAllToken: 1,
			}),
		).toBe(true);
	});

	test("collapses every folder when the tree mode is collapsed", () => {
		expect(
			shouldExpandPlanFolder({
				folderPath: "archive/audits",
				activePath: "archive/audits/report.md",
				treeMode: "collapsed",
			}),
		).toBe(false);
	});

	test("expands every folder when the tree mode is expanded", () => {
		expect(
			shouldExpandPlanFolder({
				folderPath: "archive",
				activePath: undefined,
				treeMode: "expanded",
			}),
		).toBe(true);
	});
});
