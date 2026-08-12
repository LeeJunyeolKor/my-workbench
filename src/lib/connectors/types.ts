export type ConnectorItemKind = "issue" | "review" | "deployment";

export type ConnectorItem = {
	id: string;
	kind: ConnectorItemKind;
	title: string;
	status: string;
	updatedAt?: string;
	url?: string;
	repository?: string;
	branch?: string;
};

export type ConnectorContext = {
	signal?: AbortSignal;
};

export interface WorkbenchConnector {
	readonly id: string;
	readonly label: string;
	read(context?: ConnectorContext): Promise<ConnectorItem[]>;
}

export type ConnectorResult = {
	id: string;
	label: string;
	status: "ok" | "unavailable";
	items: ConnectorItem[];
	message?: string;
};
