import { describe, expect, it } from "vitest";
import {
	expandHome,
	getDefaultPlansDir,
	getWorkbenchDataDir,
	normalizePlansDir,
	resolvePlansDir,
} from "./paths";

const HOME_DIRECTORY = "/home/example";

describe("server path resolution", () => {
	it("resolves the default workbench data directory from the server home", () => {
		expect(getWorkbenchDataDir({}, HOME_DIRECTORY)).toBe(
			"/home/example/.my-workbench",
		);
	});

	it("expands configured data and plan directories from the server home", () => {
		expect(
			getWorkbenchDataDir(
				{ MY_WORKBENCH_DATA: "~/custom-workbench" },
				HOME_DIRECTORY,
			),
		).toBe("/home/example/custom-workbench");
		expect(
			getDefaultPlansDir(
				{ WORKBENCH_PLANS_DIR: "~/custom-plans" },
				HOME_DIRECTORY,
			),
		).toBe("/home/example/custom-plans");
	});

	it("lets a saved plans directory override environment defaults", () => {
		const plansDir = resolvePlansDir(
			{ plansDir: "~/saved-plans" },
			{
				MY_WORKBENCH_DATA: "~/ignored-workbench",
				WORKBENCH_PLANS_DIR: "~/ignored-plans",
			},
			HOME_DIRECTORY,
		);

		expect(plansDir).toBe("/home/example/saved-plans");
	});

	it("falls back to MY_WORKBENCH_DATA/plans", () => {
		const plansDir = getDefaultPlansDir(
			{ MY_WORKBENCH_DATA: "~/my-workbench-data" },
			HOME_DIRECTORY,
		);

		expect(plansDir).toBe("/home/example/my-workbench-data/plans");
	});

	it("uses WORKBENCH_PLANS_DIR when configured", () => {
		expect(
			getDefaultPlansDir(
				{ WORKBENCH_PLANS_DIR: "~/plans-anywhere" },
				HOME_DIRECTORY,
			),
		).toBe("/home/example/plans-anywhere");
	});

	it("ignores an invalid saved plans directory and falls back to the default", () => {
		const plansDir = resolvePlansDir(
			{ plansDir: "relative-plans" },
			{ MY_WORKBENCH_DATA: "~/my-workbench-data" },
			HOME_DIRECTORY,
		);

		expect(plansDir).toBe("/home/example/my-workbench-data/plans");
	});

	it("ignores saved plan path settings with the wrong shape", () => {
		const plansDir = resolvePlansDir(
			{ plansDir: 42 },
			{ MY_WORKBENCH_DATA: "~/my-workbench-data" },
			HOME_DIRECTORY,
		);

		expect(plansDir).toBe("/home/example/my-workbench-data/plans");
	});

	it("rejects relative plan directories after server-side expansion", () => {
		expect(() => normalizePlansDir("relative-plans", HOME_DIRECTORY)).toThrow(
			"절대 경로 또는 ~/로 시작",
		);
		expect(expandHome("~/plans", HOME_DIRECTORY)).toBe("/home/example/plans");
	});
});
