import { createFileRoute } from "@tanstack/react-router";
import { OperationsConsolePage } from "#/routes/design-preview";
import { getOperationsConsoleData } from "#/server/operations-console";

export const Route = createFileRoute("/")({
	loader: () => getOperationsConsoleData(),
	component: OperationsConsoleDashboard,
});

function OperationsConsoleDashboard() {
	return <OperationsConsolePage data={Route.useLoaderData()} />;
}
