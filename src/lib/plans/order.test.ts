import { describe, expect, it } from "vitest";
import { filterVisiblePlanFiles, orderPlanFiles } from "#/lib/plans/order";

const files = [
	{ filename: "specs/api.md" },
	{ filename: "plan.md" },
	{ filename: "archive/old.md" },
	{ filename: "00-current.md" },
];

describe("orderPlanFiles", () => {
	it("places plan.md first and sorts the rest by filename", () => {
		expect(orderPlanFiles(files).map((file) => file.filename)).toEqual([
			"plan.md",
			"00-current.md",
			"archive/old.md",
			"specs/api.md",
		]);
	});
});

describe("filterVisiblePlanFiles", () => {
	it("shows archived files only when requested", () => {
		expect(
			filterVisiblePlanFiles(files, false).map((file) => file.filename),
		).toEqual(["specs/api.md", "plan.md", "00-current.md"]);
		expect(filterVisiblePlanFiles(files, true)).toBe(files);
	});
});
