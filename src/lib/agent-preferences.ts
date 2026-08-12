import { safeGetStorageItem, safeSetStorageItem } from "./browser-storage";

export const AGENT_TYPE_STORAGE_KEY = "my_workbench_ai_agent_type";
export const CURSOR_CLI_PATH_STORAGE_KEY = "my_workbench_cursor_cli_path";

export const AGENT_TYPES = ["gemini", "claude", "cursor", "codex"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

type ReadableStorage = {
	getItem: (key: string) => string | null;
};

type WritableStorage = {
	setItem: (key: string, value: string) => void;
};

export type AgentPreferences = {
	agentType: AgentType;
	cursorCliPath: string;
};

type AgentPreferencesPatch = Partial<AgentPreferences>;

export function isAgentType(value: string | null): value is AgentType {
	return AGENT_TYPES.includes(value as AgentType);
}

export function readAgentPreferences(
	storage: ReadableStorage | null | undefined,
): AgentPreferences {
	const storedAgent = safeGetStorageItem(storage, AGENT_TYPE_STORAGE_KEY);
	const storedCliPath = safeGetStorageItem(
		storage,
		CURSOR_CLI_PATH_STORAGE_KEY,
	);

	return {
		agentType: isAgentType(storedAgent) ? storedAgent : "gemini",
		cursorCliPath: storedCliPath?.trim() || "agent",
	};
}

export function getAgentCliPath(preferences: AgentPreferences) {
	if (preferences.agentType !== "cursor") return "";
	return preferences.cursorCliPath.trim() || "agent";
}

export function persistAgentPreferences(
	storage: WritableStorage | null | undefined,
	preferences: AgentPreferencesPatch,
) {
	let stored = true;

	if (preferences.agentType) {
		stored =
			safeSetStorageItem(
				storage,
				AGENT_TYPE_STORAGE_KEY,
				preferences.agentType,
			) && stored;
	}

	if (typeof preferences.cursorCliPath === "string") {
		stored =
			safeSetStorageItem(
				storage,
				CURSOR_CLI_PATH_STORAGE_KEY,
				preferences.cursorCliPath.trim() || "agent",
			) && stored;
	}

	return stored;
}
