import { describe, expect, it } from "vitest";
import {
	filterVisiblePlanFiles,
	getPlanFileTreeItemIds,
	movePlanFileOrder,
	orderPlanFiles,
	planFileTreeItemId,
	reorderPlanFilesByDrag,
	reorderPlanFileTreeItemsByDrag,
} from "#/lib/plans/order";

const files = [
	{ filename: "archive/old.md", title: "Old" },
	{ filename: "plan.md", title: "Plan" },
	{ filename: "specs/api.md", title: "API" },
	{ filename: "00-current.md", title: "Current" },
];

describe("orderPlanFiles", () => {
	it("uses default order when no saved order exists", () => {
		expect(orderPlanFiles(files).map((file) => file.filename)).toEqual([
			"plan.md",
			"00-current.md",
			"archive/old.md",
			"specs/api.md",
		]);
	});

	it("applies saved order and appends new files in default order", () => {
		expect(
			orderPlanFiles(files, ["specs/api.md", "plan.md"]).map(
				(file) => file.filename,
			),
		).toEqual(["specs/api.md", "plan.md", "00-current.md", "archive/old.md"]);
	});
});

describe("filterVisiblePlanFiles", () => {
	it("hides files under the archive folder unless enabled", () => {
		expect(
			filterVisiblePlanFiles(files, false).map((file) => file.filename),
		).toEqual(["plan.md", "specs/api.md", "00-current.md"]);

		expect(filterVisiblePlanFiles(files, true)).toBe(files);
	});
});

describe("movePlanFileOrder", () => {
	it("moves a file up or down without crossing list boundaries", () => {
		const filenames = ["plan.md", "00-current.md", "archive/old.md"];

		expect(movePlanFileOrder(filenames, "archive/old.md", "up")).toEqual([
			"plan.md",
			"archive/old.md",
			"00-current.md",
		]);
		expect(movePlanFileOrder(filenames, "plan.md", "up")).toEqual(filenames);
		expect(movePlanFileOrder(filenames, "archive/old.md", "down")).toEqual(
			filenames,
		);
	});
});

describe("reorderPlanFilesByDrag", () => {
	it("moves the dragged file before the hovered file", () => {
		expect(
			reorderPlanFilesByDrag(
				["plan.md", "00-current.md", "archive/old.md"],
				"archive/old.md",
				"plan.md",
			),
		).toEqual(["archive/old.md", "plan.md", "00-current.md"]);
	});

	it("keeps order unchanged for unknown files", () => {
		const filenames = ["plan.md", "00-current.md"];
		expect(reorderPlanFilesByDrag(filenames, "missing.md", "plan.md")).toEqual(
			filenames,
		);
	});
});

describe("plan file tree drag order", () => {
	it("adds sortable ids for files and folders in tree order", () => {
		expect(
			getPlanFileTreeItemIds([
				"plan.md",
				"archive/old.md",
				"archive/audit/check.md",
			]),
		).toEqual([
			"file:plan.md",
			"folder:archive",
			"file:archive/old.md",
			"folder:archive/audit",
			"file:archive/audit/check.md",
		]);
	});

	it("moves a dragged folder as one file block", () => {
		const filenames = [
			"plan.md",
			"archive/old.md",
			"archive/notes.md",
			"specs/api.md",
			"draft.md",
		];

		expect(
			reorderPlanFileTreeItemsByDrag(
				filenames,
				planFileTreeItemId("folder", "specs"),
				planFileTreeItemId("folder", "archive"),
			),
		).toEqual([
			"plan.md",
			"specs/api.md",
			"archive/old.md",
			"archive/notes.md",
			"draft.md",
		]);
	});

	it("moves a folder after the hovered item when dragging downward", () => {
		const filenames = [
			"plan.md",
			"archive/old.md",
			"archive/notes.md",
			"specs/api.md",
			"draft.md",
		];

		expect(
			reorderPlanFileTreeItemsByDrag(
				filenames,
				planFileTreeItemId("folder", "archive"),
				planFileTreeItemId("folder", "specs"),
			),
		).toEqual([
			"plan.md",
			"specs/api.md",
			"archive/old.md",
			"archive/notes.md",
			"draft.md",
		]);
	});

	it("keeps order unchanged when a folder is dropped on its own child", () => {
		const filenames = ["plan.md", "archive/old.md", "archive/notes.md"];

		expect(
			reorderPlanFileTreeItemsByDrag(
				filenames,
				planFileTreeItemId("folder", "archive"),
				planFileTreeItemId("file", "archive/old.md"),
			),
		).toBe(filenames);
	});
});
