import path from "node:path";
import { getPlansDir } from "#/server/paths";

const TASK_ID_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]+$/;

export function isValidTaskId(taskId: string): boolean {
	return TASK_ID_PATTERN.test(taskId);
}

export function planFilePath(taskId: string): string | null {
	if (!isValidTaskId(taskId)) return null;
	const plansDir = getPlansDir();
	const dir = path.join(plansDir, taskId);
	const file = path.join(dir, "plan.md");
	const resolvedDir = path.resolve(dir);
	const resolvedFile = path.resolve(file);
	if (!resolvedDir.startsWith(path.resolve(plansDir))) return null;
	if (!resolvedFile.startsWith(resolvedDir + path.sep)) return null;
	return resolvedFile;
}

export function planDirPath(taskId: string): string | null {
	if (!isValidTaskId(taskId)) return null;
	const plansDir = getPlansDir();
	const dir = path.join(plansDir, taskId);
	const resolved = path.resolve(dir);
	if (!resolved.startsWith(path.resolve(plansDir))) return null;
	return resolved;
}
