import type {
	ConnectorResult,
	WorkbenchConnector,
} from "#/lib/connectors/types";

const connectors: WorkbenchConnector[] = [];

export async function readConnectors(): Promise<ConnectorResult[]> {
	return Promise.all(connectors.map(readConnector));
}

async function readConnector(
	connector: WorkbenchConnector,
): Promise<ConnectorResult> {
	try {
		return {
			id: connector.id,
			label: connector.label,
			status: "ok",
			items: await connector.read(),
		};
	} catch (error) {
		return {
			id: connector.id,
			label: connector.label,
			status: "unavailable",
			items: [],
			message:
				error instanceof Error
					? error.message
					: "Connector data could not be read.",
		};
	}
}
