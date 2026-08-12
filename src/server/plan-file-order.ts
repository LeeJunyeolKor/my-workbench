import fs from "node:fs/promises";
import path from "node:path";
import { WORKBENCH_DATA } from "#/server/paths";

const PLAN_FILE_ORDER_PATH = path.join(WORKBENCH_DATA, "plan_file_order.json");

type PlanFileOrderStore = Record<string, string[]>;

function normalizeStore(value: unknown): PlanFileOrderStore {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};

	return Object.fromEntries(
		Object.entries(value).map(([taskId, filenames]) => [
			taskId,
			Array.isArray(filenames)
				? filenames.filter((filename): filename is string => {
						return typeof filename === "string";
					})
				: [],
		]),
	);
}

async function readStore(): Promise<PlanFileOrderStore> {
	try {
		const content = await fs.readFile(PLAN_FILE_ORDER_PATH, "utf8");
		return normalizeStore(JSON.parse(content));
	} catch {
		return {};
	}
}

export async function readPlanFileOrder(taskId: string): Promise<string[]> {
	const store = await readStore();
	return store[taskId] ?? [];
}

export async function savePlanFileOrder(
	taskId: string,
	filenames: string[],
): Promise<void> {
	const store = await readStore();
	store[taskId] = filenames;
	await fs.mkdir(path.dirname(PLAN_FILE_ORDER_PATH), { recursive: true });
	await fs.writeFile(
		PLAN_FILE_ORDER_PATH,
		JSON.stringify(store, null, 2),
		"utf8",
	);
}
