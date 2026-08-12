import fs from "node:fs";
import os from "node:os";
import { createIsomorphicFn } from "@tanstack/react-start";
import { DEFAULT_WORKBENCH_DATA_PATH, expandHomePath } from "#/lib/paths";

type WorkbenchPathEnv = {
	MY_WORKBENCH_DATA?: string;
	WORKBENCH_PLANS_DIR?: string;
};

type PlanPathSettings = {
	plansDir?: string | null;
};

const getRuntimeHomeDirectory = createIsomorphicFn()
	.server(() => os.homedir())
	// Client bundles initialize exported constants but never access the filesystem.
	.client(() => "/");

const getRuntimePathEnv = createIsomorphicFn()
	.server((): WorkbenchPathEnv => process.env)
	.client((): WorkbenchPathEnv => ({}));

export function expandHome(
	input: string,
	homeDirectory: string = getRuntimeHomeDirectory(),
): string {
	return expandHomePath(input, homeDirectory);
}

export function normalizePlansDir(
	input: string,
	homeDirectory: string = getRuntimeHomeDirectory(),
): string {
	const expanded = expandHome(input.trim(), homeDirectory);
	if (!expanded || !expanded.startsWith("/")) {
		throw new Error("구현 계획 위치는 절대 경로 또는 ~/로 시작해야 합니다.");
	}
	return expanded.replace(/\/+$/, "") || "/";
}

export function getWorkbenchDataDir(
	env: WorkbenchPathEnv = getRuntimePathEnv(),
	homeDirectory: string = getRuntimeHomeDirectory(),
): string {
	return expandHome(
		env.MY_WORKBENCH_DATA?.trim() || DEFAULT_WORKBENCH_DATA_PATH,
		homeDirectory,
	);
}

export function getDefaultPlansDir(
	env: WorkbenchPathEnv = getRuntimePathEnv(),
	homeDirectory: string = getRuntimeHomeDirectory(),
): string {
	const explicitPlansDir = env.WORKBENCH_PLANS_DIR?.trim();
	if (explicitPlansDir) {
		return normalizePlansDir(explicitPlansDir, homeDirectory);
	}

	return normalizePlansDir(
		`${getWorkbenchDataDir(env, homeDirectory)}/plans`,
		homeDirectory,
	);
}

export function resolvePlansDir(
	settings: unknown = null,
	env: WorkbenchPathEnv = getRuntimePathEnv(),
	homeDirectory: string = getRuntimeHomeDirectory(),
): string {
	const savedPlansDir = getSavedPlansDir(settings);
	if (!savedPlansDir) return getDefaultPlansDir(env, homeDirectory);

	try {
		return normalizePlansDir(savedPlansDir, homeDirectory);
	} catch {
		return getDefaultPlansDir(env, homeDirectory);
	}
}

function getSavedPlansDir(settings: unknown): string | null {
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
		return null;
	}

	const plansDir = (settings as PlanPathSettings).plansDir;
	return typeof plansDir === "string" ? plansDir.trim() : null;
}

export const WORKBENCH_DATA = getWorkbenchDataDir();
export const PLAN_SETTINGS_FILE = `${WORKBENCH_DATA}/plan_settings.json`;
export const PLANS_DIR = getDefaultPlansDir();
export const TASKS_FILE = `${WORKBENCH_DATA}/TASKS.md`;

function readPlanPathSettings(): unknown {
	try {
		return JSON.parse(fs.readFileSync(PLAN_SETTINGS_FILE, "utf8"));
	} catch {
		return null;
	}
}

export function getPlansDir(): string {
	return resolvePlansDir(readPlanPathSettings());
}
