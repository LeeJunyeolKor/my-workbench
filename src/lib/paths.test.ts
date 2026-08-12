import { describe, expect, it } from "vitest";
import { DEFAULT_WORKBENCH_DATA_PATH, expandHomePath } from "./paths";

describe("workbench path strings", () => {
	it("keeps the default data path independent of the runtime environment", () => {
		expect(DEFAULT_WORKBENCH_DATA_PATH).toBe("~/.my-workbench");
	});

	it("expands home-relative paths from an explicit home directory", () => {
		expect(expandHomePath("~/workspace", "/home/example")).toBe(
			"/home/example/workspace",
		);
		expect(expandHomePath("~", "/home/example")).toBe("/home/example");
	});

	it("leaves absolute and non-home-relative paths unchanged", () => {
		expect(expandHomePath("/srv/workbench", "/home/example")).toBe(
			"/srv/workbench",
		);
		expect(expandHomePath("~other/workbench", "/home/example")).toBe(
			"~other/workbench",
		);
	});

	it("avoids duplicate separators after the home directory", () => {
		expect(expandHomePath("~/workspace", "/home/example/")).toBe(
			"/home/example/workspace",
		);
		expect(expandHomePath("~/workspace", "/")).toBe("/workspace");
	});
});
