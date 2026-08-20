import { safeGetStorageItem, safeSetStorageItem } from "#/lib/browser-storage";

export const PLAN_SIDEBAR_WIDTH_STORAGE_KEY = "my_workbench_plan_sidebar_width";
export const DEFAULT_PLAN_SIDEBAR_WIDTH = 300;

const MIN_PLAN_SIDEBAR_WIDTH = 260;
const MAX_PLAN_SIDEBAR_WIDTH = 440;

type ReadableStorage = {
	getItem: (key: string) => string | null;
};

type WritableStorage = {
	setItem: (key: string, value: string) => void;
};

export function clampPlanSidebarWidth(width: number) {
	return Math.max(
		MIN_PLAN_SIDEBAR_WIDTH,
		Math.min(MAX_PLAN_SIDEBAR_WIDTH, width),
	);
}

export function readPlanSidebarWidth(
	storage: ReadableStorage | null | undefined,
) {
	const storedWidth = safeGetStorageItem(
		storage,
		PLAN_SIDEBAR_WIDTH_STORAGE_KEY,
	);
	if (!storedWidth) return DEFAULT_PLAN_SIDEBAR_WIDTH;

	const parsedWidth = Number.parseInt(storedWidth, 10);
	return Number.isNaN(parsedWidth)
		? DEFAULT_PLAN_SIDEBAR_WIDTH
		: clampPlanSidebarWidth(parsedWidth);
}

export function persistPlanSidebarWidth(
	storage: WritableStorage | null | undefined,
	width: number,
) {
	return safeSetStorageItem(
		storage,
		PLAN_SIDEBAR_WIDTH_STORAGE_KEY,
		String(clampPlanSidebarWidth(width)),
	);
}
