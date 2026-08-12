import type {
	AgentSettingsAgent,
	AgentSettingsItem,
	AgentSettingsKind,
	AgentSettingsProject,
} from "./types";

export type AgentSettingsFilter = {
	kind: AgentSettingsKind | "all";
	agent: AgentSettingsAgent | "all";
	project: AgentSettingsProject | "all";
	query: string;
};

export function filterAgentSettingsItems<T extends AgentSettingsItem>(
	items: T[],
	filter: AgentSettingsFilter,
) {
	const normalizedQuery = filter.query.trim().toLocaleLowerCase();

	return items.filter((item) => {
		if (filter.kind !== "all" && item.kind !== filter.kind) return false;
		if (
			filter.agent !== "all" &&
			!getAgentSettingsItemAgents(item).includes(filter.agent)
		) {
			return false;
		}
		if (filter.project !== "all" && item.project !== filter.project)
			return false;
		if (!normalizedQuery) return true;

		const haystack = [
			item.name,
			item.description,
			item.sourcePath,
			...getAgentSettingsItemAgents(item),
			item.kind,
			item.project,
			item.scope,
		]
			.join(" ")
			.toLocaleLowerCase();

		return haystack.includes(normalizedQuery);
	});
}

export function getAgentSettingsKindCounts(items: AgentSettingsItem[]) {
	return items.reduce(
		(counts, item) => {
			counts.all += 1;
			counts[item.kind] += 1;
			return counts;
		},
		{ all: 0, hook: 0, rule: 0, skill: 0 },
	);
}

export function getAgentSettingsAgentCounts(items: AgentSettingsItem[]) {
	return items.reduce<Record<AgentSettingsAgent | "all", number>>(
		(counts, item) => {
			counts.all += 1;
			for (const agent of getAgentSettingsItemAgents(item)) {
				counts[agent] += 1;
			}
			return counts;
		},
		{
			all: 0,
			claude: 0,
			codex: 0,
			cursor: 0,
			gemini: 0,
			shared: 0,
		},
	);
}

export function getAgentSettingsItemAgents(item: AgentSettingsItem) {
	return item.agents?.length ? Array.from(new Set(item.agents)) : [item.agent];
}

export function getAgentSettingsWritePaths(items: AgentSettingsItem[]) {
	return Array.from(
		new Set(
			items.flatMap((item) =>
				item.writePaths?.length ? item.writePaths : [item.sourcePath],
			),
		),
	).sort();
}

export function getAgentSettingsProjectCounts(items: AgentSettingsItem[]) {
	return items.reduce<Record<AgentSettingsProject | "all", number>>(
		(counts, item) => {
			counts.all += 1;
			counts[item.project] += 1;
			return counts;
		},
		{
			all: 0,
			personal: 0,
			workspace: 0,
		},
	);
}

export function getAgentSettingsFacetedCounts(
	items: AgentSettingsItem[],
	filter: AgentSettingsFilter,
) {
	return {
		kind: getAgentSettingsKindCounts(
			filterAgentSettingsItems(items, { ...filter, kind: "all" }),
		),
		agent: getAgentSettingsAgentCounts(
			filterAgentSettingsItems(items, { ...filter, agent: "all" }),
		),
		project: getAgentSettingsProjectCounts(
			filterAgentSettingsItems(items, { ...filter, project: "all" }),
		),
	};
}
