export type AgentSettingsAgent =
	| "codex"
	| "claude"
	| "cursor"
	| "gemini"
	| "shared";

export type AgentSettingsKind = "rule" | "skill" | "hook";

export type AgentSettingsProject = "personal" | "workspace";

export type AgentSettingsScope = "personal" | "project";

export type AgentSettingsItem = {
	id: string;
	agent: AgentSettingsAgent;
	agents?: AgentSettingsAgent[];
	kind: AgentSettingsKind;
	name: string;
	description: string;
	project: AgentSettingsProject;
	scope: AgentSettingsScope;
	sourcePath: string;
	writePaths?: string[];
	enabledByDefault: boolean;
};

export type AgentSettingsInventory = {
	items: AgentSettingsItem[];
	scannedAt: string;
	sources: string[];
};

export type AgentSettingsDetail = {
	item: AgentSettingsItem;
	markdown: string;
	raw: string;
	html: string;
};
