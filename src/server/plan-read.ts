import fs from "node:fs/promises";
import { summarizePlan } from "#/lib/plans/parser";
import { planDirPath, planFilePath } from "#/lib/plans/paths";
import type { PlanSummary } from "#/lib/plans/types";
import { getPlansDir } from "#/server/paths";

async function readPlanSummary(taskId: string): Promise<PlanSummary | null> {
	const filePath = planFilePath(taskId);
	if (!filePath) return null;

	try {
		const [content, stat] = await Promise.all([
			fs.readFile(filePath, "utf8"),
			fs.stat(filePath),
		]);
		return summarizePlan(taskId, content, stat.mtime);
	} catch {
		return null;
	}
}

export async function readPlanSummaries() {
	const plansDir = getPlansDir();
	let entries: string[] = [];
	try {
		entries = await fs.readdir(plansDir);
	} catch {
		return { plans: [] as PlanSummary[], plansDir };
	}

	const summaries = await Promise.all(
		entries.map(async (entry) => {
			const dir = planDirPath(entry);
			if (!dir) return null;
			try {
				const stat = await fs.stat(dir);
				if (!stat.isDirectory()) return null;
			} catch {
				return null;
			}
			return readPlanSummary(entry);
		}),
	);

	const plans = summaries
		.filter((plan): plan is PlanSummary => plan !== null)
		.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

	return { plans, plansDir };
}
