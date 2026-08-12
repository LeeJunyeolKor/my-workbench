import { safeGetStorageItem, safeSetStorageItem } from "#/lib/browser-storage";

export const CHAT_DOCK_STORAGE_KEY = "my_workbench_chat_dock";
export const CHAT_OPEN_STORAGE_KEY = "my_workbench_chat_open";
export const CHAT_WIDTH_STORAGE_KEY = "my_workbench_chat_width";
export const CHAT_HEIGHT_STORAGE_KEY = "my_workbench_chat_height";
export const PLAN_SIDEBAR_WIDTH_STORAGE_KEY = "my_workbench_plan_sidebar_width";

export type ChatDock = "floating" | "left" | "right" | "bottom";

export type PlanChatLayoutPreferences = {
	chatDock: ChatDock;
	chatHeight: number;
	chatOpen: boolean;
	chatWidth: number;
	planSidebarWidth: number;
};

type ReadableStorage = {
	getItem: (key: string) => string | null;
};

type WritableStorage = {
	setItem: (key: string, value: string) => void;
};

type PlanChatLayoutPreferencesPatch = Partial<PlanChatLayoutPreferences>;

const DEFAULT_CHAT_DOCK: ChatDock = "floating";
const DEFAULT_CHAT_OPEN = true;
const DEFAULT_CHAT_WIDTH = 360;
const MIN_CHAT_WIDTH = 320;
const MAX_CHAT_WIDTH = 640;
const DEFAULT_CHAT_HEIGHT = 360;
const MIN_CHAT_HEIGHT = 300;
const MAX_CHAT_HEIGHT = 760;
export const DEFAULT_PLAN_SIDEBAR_WIDTH = 300;
const MIN_PLAN_SIDEBAR_WIDTH = 260;
const MAX_PLAN_SIDEBAR_WIDTH = 440;

export function isChatDock(value: string | null): value is ChatDock {
	return (
		value === "floating" ||
		value === "left" ||
		value === "right" ||
		value === "bottom"
	);
}

export function clampChatWidth(width: number) {
	return Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, width));
}

export function clampChatHeight(height: number) {
	return Math.max(MIN_CHAT_HEIGHT, Math.min(MAX_CHAT_HEIGHT, height));
}

export function clampPlanSidebarWidth(width: number) {
	return Math.max(
		MIN_PLAN_SIDEBAR_WIDTH,
		Math.min(MAX_PLAN_SIDEBAR_WIDTH, width),
	);
}

function parseStoredNumber(
	value: string | null,
	defaultValue: number,
	clamp: (value: number) => number,
) {
	if (!value) return defaultValue;
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed)) return defaultValue;
	return clamp(parsed);
}

export function readPlanChatLayoutPreferences(
	storage: ReadableStorage | null | undefined,
): PlanChatLayoutPreferences {
	const storedDock = safeGetStorageItem(storage, CHAT_DOCK_STORAGE_KEY);
	const storedOpen = safeGetStorageItem(storage, CHAT_OPEN_STORAGE_KEY);
	const storedWidth = safeGetStorageItem(storage, CHAT_WIDTH_STORAGE_KEY);
	const storedHeight = safeGetStorageItem(storage, CHAT_HEIGHT_STORAGE_KEY);
	const storedSidebarWidth = safeGetStorageItem(
		storage,
		PLAN_SIDEBAR_WIDTH_STORAGE_KEY,
	);

	return {
		chatDock: isChatDock(storedDock) ? storedDock : DEFAULT_CHAT_DOCK,
		chatHeight: parseStoredNumber(
			storedHeight,
			DEFAULT_CHAT_HEIGHT,
			clampChatHeight,
		),
		chatOpen: storedOpen === "false" ? false : DEFAULT_CHAT_OPEN,
		chatWidth: parseStoredNumber(
			storedWidth,
			DEFAULT_CHAT_WIDTH,
			clampChatWidth,
		),
		planSidebarWidth: parseStoredNumber(
			storedSidebarWidth,
			DEFAULT_PLAN_SIDEBAR_WIDTH,
			clampPlanSidebarWidth,
		),
	};
}

export function persistPlanChatLayoutPreferences(
	storage: WritableStorage | null | undefined,
	preferences: PlanChatLayoutPreferencesPatch,
) {
	let stored = true;

	if (preferences.chatDock) {
		stored =
			safeSetStorageItem(
				storage,
				CHAT_DOCK_STORAGE_KEY,
				preferences.chatDock,
			) && stored;
	}

	if (typeof preferences.chatOpen === "boolean") {
		stored =
			safeSetStorageItem(
				storage,
				CHAT_OPEN_STORAGE_KEY,
				String(preferences.chatOpen),
			) && stored;
	}

	if (typeof preferences.chatWidth === "number") {
		stored =
			safeSetStorageItem(
				storage,
				CHAT_WIDTH_STORAGE_KEY,
				String(clampChatWidth(preferences.chatWidth)),
			) && stored;
	}

	if (typeof preferences.chatHeight === "number") {
		stored =
			safeSetStorageItem(
				storage,
				CHAT_HEIGHT_STORAGE_KEY,
				String(clampChatHeight(preferences.chatHeight)),
			) && stored;
	}

	if (typeof preferences.planSidebarWidth === "number") {
		stored =
			safeSetStorageItem(
				storage,
				PLAN_SIDEBAR_WIDTH_STORAGE_KEY,
				String(clampPlanSidebarWidth(preferences.planSidebarWidth)),
			) && stored;
	}

	return stored;
}
