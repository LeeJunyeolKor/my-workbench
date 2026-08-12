import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	Box,
	Check,
	FileText,
	LoaderCircle,
	Power,
	PowerOff,
	Search,
	ShieldCheck,
	SlidersHorizontal,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AppShell } from "#/components/layout/AppShell";
import {
	filterAgentSettingsItems,
	getAgentSettingsFacetedCounts,
	getAgentSettingsItemAgents,
} from "#/lib/agent-settings/filter";
import type {
	AgentSettingsAgent,
	AgentSettingsDetail,
	AgentSettingsItem,
	AgentSettingsKind,
	AgentSettingsProject,
	AgentSettingsScope,
} from "#/lib/agent-settings/types";
import { cn } from "#/lib/cn";
import { getErrorMessage } from "#/lib/errors";
import {
	getAgentSettingDetail,
	getAgentSettingsInventory,
	setAgentSettingsEnabled,
} from "#/server/agent-settings";

const KIND_TABS: Array<{
	value: AgentSettingsKind | "all";
	label: string;
}> = [
	{ value: "all", label: "전체" },
	{ value: "rule", label: "룰" },
	{ value: "skill", label: "스킬" },
	{ value: "hook", label: "훅" },
];

const AGENT_FILTERS: Array<{
	value: AgentSettingsAgent | "all";
	label: string;
}> = [
	{ value: "all", label: "모든 에이전트" },
	{ value: "codex", label: "Codex" },
	{ value: "claude", label: "Claude" },
	{ value: "cursor", label: "Cursor" },
	{ value: "gemini", label: "Gemini" },
	{ value: "shared", label: "공용" },
];

const PROJECT_FILTERS: Array<{
	value: AgentSettingsProject | "all";
	label: string;
}> = [
	{ value: "all", label: "전체" },
	{ value: "workspace", label: "현재 작업공간" },
	{ value: "personal", label: "개인" },
];

const MARKDOWN_PREVIEW_CLASSNAME =
	"prose prose-zinc dark:prose-invert prose-sm max-w-none rounded-lg border dark:border-white/5 border-zinc-200/80 dark:bg-black/20 bg-white p-5 text-zinc-800 dark:text-zinc-200";

type AgentSettingsDetailState = {
	item: AgentSettingsItem;
	detail: AgentSettingsDetail | null;
	loading: boolean;
	error: string | null;
};

export const Route = createFileRoute("/agent-settings")({
	loader: async () => getAgentSettingsInventory(),
	component: AgentSettingsPage,
	pendingComponent: AgentSettingsSkeleton,
	pendingMs: 100,
	pendingMinMs: 300,
});

function AgentSettingsPage() {
	const router = useRouter();
	const inventory = Route.useLoaderData();
	const setAgentSettingsEnabledFn = useServerFn(setAgentSettingsEnabled);
	const [activeKind, setActiveKind] = useState<AgentSettingsKind | "all">(
		"all",
	);
	const [activeAgent, setActiveAgent] = useState<AgentSettingsAgent | "all">(
		"all",
	);
	const [activeProject, setActiveProject] = useState<
		AgentSettingsProject | "all"
	>("all");
	const [query, setQuery] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [detailState, setDetailState] =
		useState<AgentSettingsDetailState | null>(null);

	const items = useMemo(
		() =>
			inventory.items.map((item) => ({
				...item,
				enabled: item.enabledByDefault,
			})),
		[inventory.items],
	);

	const facetedCounts = useMemo(
		() =>
			getAgentSettingsFacetedCounts(inventory.items, {
				agent: activeAgent,
				kind: activeKind,
				project: activeProject,
				query,
			}),
		[activeAgent, activeKind, activeProject, inventory.items, query],
	);
	const filteredItems = useMemo(
		() =>
			filterAgentSettingsItems(items, {
				agent: activeAgent,
				kind: activeKind,
				project: activeProject,
				query,
			}),
		[activeAgent, activeKind, activeProject, items, query],
	);
	const enabledCount = filteredItems.filter((item) => item.enabled).length;
	const hasFilteredItems = filteredItems.length > 0;
	const allFilteredEnabled =
		hasFilteredItems && enabledCount === filteredItems.length;
	const allFilteredDisabled = hasFilteredItems && enabledCount === 0;

	const handleSetItemsEnabled = async (
		targetItems: Array<AgentSettingsItem & { enabled: boolean }>,
		enabled: boolean,
	) => {
		if (targetItems.length === 0 || isSaving) return;
		const targets = targetItems.map(
			({ agent, description, id, kind, name, sourcePath }) => ({
				agent,
				description,
				id,
				kind,
				name,
				sourcePath,
			}),
		);
		setIsSaving(true);
		setSaveError(null);
		try {
			await setAgentSettingsEnabledFn({
				data: { enabled, targets },
			});
			await router.invalidate();
		} catch (error) {
			setSaveError(getErrorMessage(error, "설정을 변경하지 못했습니다."));
		} finally {
			setIsSaving(false);
		}
	};

	const handleToggle = (item: AgentSettingsItem & { enabled: boolean }) => {
		void handleSetItemsEnabled([item], !item.enabled);
	};

	const handleSetFilteredItemsEnabled = (enabled: boolean) => {
		void handleSetItemsEnabled(filteredItems, enabled);
	};

	const handleOpenDetail = async (item: AgentSettingsItem) => {
		setDetailState({ item, detail: null, loading: true, error: null });
		try {
			const detail = await getAgentSettingDetail({ data: { id: item.id } });
			setDetailState({
				item: detail.item,
				detail,
				loading: false,
				error: null,
			});
		} catch (error) {
			setDetailState({
				item,
				detail: null,
				loading: false,
				error: getErrorMessage(error, "상세 내용을 불러오지 못했습니다."),
			});
		}
	};

	return (
		<AppShell>
			<div className="min-h-[calc(100vh-3rem)] bg-white text-zinc-800">
				<div className="mx-auto flex w-full max-w-7xl flex-col px-5 py-7 sm:px-8 lg:px-12">
					<section className="flex flex-col gap-4 border-b border-zinc-100 pb-5">
						<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
							<div className="flex min-w-0 gap-3 overflow-x-auto pb-1">
								{KIND_TABS.map((tab) => (
									<button
										key={tab.value}
										type="button"
										onClick={() => setActiveKind(tab.value)}
										className={cn(
											"flex shrink-0 items-center gap-2 rounded-[14px] px-4 py-2 text-base font-medium transition",
											activeKind === tab.value
												? "bg-zinc-100 text-zinc-950"
												: "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800",
										)}
									>
										<span>{tab.label}</span>
										<span className="text-zinc-500">
											{facetedCounts.kind[tab.value]}
										</span>
									</button>
								))}
							</div>
							<div className="relative w-full lg:w-[360px]">
								<Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
								<input
									type="search"
									value={query}
									onChange={(event) => setQuery(event.currentTarget.value)}
									placeholder="설정 검색"
									className="h-12 w-full rounded-[14px] border border-zinc-200 bg-white pl-12 pr-4 text-base text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100"
								/>
							</div>
						</div>

						<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
							<div className="flex min-w-0 flex-col gap-2">
								<div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
									{PROJECT_FILTERS.map((project) => (
										<button
											key={project.value}
											type="button"
											onClick={() => setActiveProject(project.value)}
											className={cn(
												"flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition",
												activeProject === project.value
													? "border-zinc-300 bg-zinc-950 text-white"
													: "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
											)}
										>
											<span>{project.label}</span>
											<span
												className={cn(
													"text-xs",
													activeProject === project.value
														? "text-zinc-300"
														: "text-zinc-400",
												)}
											>
												{facetedCounts.project[project.value]}
											</span>
										</button>
									))}
								</div>

								<div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
									{AGENT_FILTERS.map((agent) => (
										<button
											key={agent.value}
											type="button"
											onClick={() => setActiveAgent(agent.value)}
											className={cn(
												"flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition",
												activeAgent === agent.value
													? "border-zinc-300 bg-zinc-950 text-white"
													: "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
											)}
										>
											<span>{agent.label}</span>
											<span
												className={cn(
													"text-xs",
													activeAgent === agent.value
														? "text-zinc-300"
														: "text-zinc-400",
												)}
											>
												{facetedCounts.agent[agent.value]}
											</span>
										</button>
									))}
								</div>
							</div>

							<div className="flex shrink-0 flex-wrap items-center gap-2 text-sm text-zinc-500">
								<BulkToggleButton
									disabled={isSaving || !hasFilteredItems || allFilteredEnabled}
									icon={<Power className="h-4 w-4" />}
									label="표시 전체 활성"
									onClick={() => handleSetFilteredItemsEnabled(true)}
								/>
								<BulkToggleButton
									disabled={
										isSaving || !hasFilteredItems || allFilteredDisabled
									}
									icon={<PowerOff className="h-4 w-4" />}
									label="표시 전체 비활성"
									onClick={() => handleSetFilteredItemsEnabled(false)}
								/>
								<span className="inline-flex items-center gap-1.5">
									<Check className="h-4 w-4 text-emerald-500" />
									{enabledCount}개 활성
								</span>
								<span>{filteredItems.length}개 표시</span>
								<span>{inventory.sources.length}개 소스</span>
								{isSaving && <span>변경 중...</span>}
							</div>
						</div>
						{saveError && (
							<p className="text-sm font-medium text-red-600">{saveError}</p>
						)}
					</section>

					<section className="divide-y divide-zinc-100">
						{filteredItems.length === 0 ? (
							<EmptyResult />
						) : (
							filteredItems.map((item) => (
								<AgentSettingRow
									key={item.id}
									disabled={isSaving}
									item={item}
									onOpen={() => handleOpenDetail(item)}
									onToggle={() => handleToggle(item)}
								/>
							))
						)}
					</section>
				</div>
			</div>

			{detailState && (
				<AgentSettingDetailModal
					state={detailState}
					onClose={() => setDetailState(null)}
				/>
			)}
		</AppShell>
	);
}

function BulkToggleButton({
	disabled,
	icon,
	label,
	onClick,
}: {
	disabled: boolean;
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
		>
			{icon}
			<span>{label}</span>
		</button>
	);
}

function AgentSettingRow({
	disabled,
	item,
	onOpen,
	onToggle,
}: {
	disabled: boolean;
	item: AgentSettingsItem & { enabled: boolean };
	onOpen: () => void;
	onToggle: () => void;
}) {
	const icon = getKindIcon(item.kind);

	return (
		<div
			className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 py-5 transition hover:bg-zinc-50/70 sm:items-center sm:gap-x-5"
			title={item.sourcePath}
		>
			<button
				type="button"
				onClick={onOpen}
				className="group col-span-2 grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-4 rounded-md text-left focus:outline-none focus:ring-4 focus:ring-zinc-100 sm:col-span-1 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:items-center sm:gap-5"
				aria-label={`${item.name} 상세 보기`}
			>
				<span className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition group-hover:border-zinc-300 group-hover:text-zinc-800 sm:h-12 sm:w-12">
					{icon}
				</span>

				<span className="min-w-0">
					<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
						<span className="truncate text-[17px] font-semibold leading-6 text-zinc-700 transition group-hover:text-zinc-950">
							{item.name}
						</span>
						<span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 sm:hidden">
							{getScopeLabel(item.scope)}
						</span>
					</span>
					<span className="mt-1 line-clamp-2 text-[15px] leading-6 text-zinc-500 sm:line-clamp-1">
						{item.description}
					</span>
				</span>

				<span className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:flex-nowrap sm:justify-end">
					<span className="hidden min-w-12 text-sm font-medium text-zinc-700 sm:inline">
						{getScopeLabel(item.scope)}
					</span>
					<span className="inline-flex items-center rounded-full bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-500">
						{getProjectLabel(item.project)}
					</span>
					{getAgentSettingsItemAgents(item).map((agent) => (
						<span
							key={agent}
							className="inline-flex items-center rounded-full bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-500"
						>
							{getAgentLabel(agent)}
						</span>
					))}
					<span className="inline-flex items-center rounded-full bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-500">
						{getKindLabel(item.kind)}
					</span>
				</span>
			</button>

			<div className="col-span-2 justify-self-start pl-[60px] sm:col-span-1 sm:pl-0 sm:justify-self-end">
				<ToggleSwitch
					checked={item.enabled}
					disabled={disabled}
					label={`${item.name} ${item.enabled ? "비활성화" : "활성화"}`}
					onChange={onToggle}
				/>
			</div>
		</div>
	);
}

function ToggleSwitch({
	checked,
	disabled,
	label,
	onChange,
}: {
	checked: boolean;
	disabled: boolean;
	label: string;
	onChange: () => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={(event) => {
				event.stopPropagation();
				onChange();
			}}
			className={cn(
				"relative h-8 w-[52px] rounded-full transition focus:outline-none focus:ring-4 focus:ring-zinc-100 disabled:cursor-not-allowed disabled:opacity-50",
				checked ? "bg-zinc-900" : "bg-zinc-200",
			)}
		>
			<span
				className={cn(
					"absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition",
					checked ? "left-[22px]" : "left-1",
				)}
			/>
		</button>
	);
}

function AgentSettingDetailModal({
	state,
	onClose,
}: {
	state: AgentSettingsDetailState;
	onClose: () => void;
}) {
	const [showRaw, setShowRaw] = useState(false);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm">
			<button
				type="button"
				aria-label="상세 닫기"
				className="absolute inset-0 cursor-default"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="agent-setting-detail-title"
				className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
			>
				<header className="flex shrink-0 items-start gap-4 border-b border-zinc-100 px-5 py-4 sm:px-6">
					<div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-600">
						<FileText className="h-5 w-5" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<h2
								id="agent-setting-detail-title"
								className="truncate text-lg font-semibold text-zinc-900"
							>
								{state.item.name}
							</h2>
							{getAgentSettingsItemAgents(state.item).map((agent) => (
								<span
									key={agent}
									className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500"
								>
									{getAgentLabel(agent)}
								</span>
							))}
							<span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">
								{getProjectLabel(state.item.project)}
							</span>
							<span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">
								{getKindLabel(state.item.kind)}
							</span>
							<span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">
								{getScopeLabel(state.item.scope)}
							</span>
						</div>
						<p className="mt-1 truncate text-xs text-zinc-400">
							{state.item.sourcePath}
						</p>
					</div>

					<div className="flex shrink-0 items-center gap-2">
						{state.detail && (
							<div className="hidden rounded-xl border border-zinc-200 bg-zinc-50 p-1 sm:flex">
								<DetailModeButton
									active={!showRaw}
									label="미리보기"
									onClick={() => setShowRaw(false)}
								/>
								<DetailModeButton
									active={showRaw}
									label="원본"
									onClick={() => setShowRaw(true)}
								/>
							</div>
						)}
						<button
							type="button"
							onClick={onClose}
							className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-4 focus:ring-zinc-100"
							aria-label="상세 닫기"
						>
							<X className="h-5 w-5" />
						</button>
					</div>
				</header>

				{state.detail && (
					<div className="flex shrink-0 border-b border-zinc-100 px-5 py-3 sm:hidden">
						<div className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
							<DetailModeButton
								active={!showRaw}
								label="미리보기"
								onClick={() => setShowRaw(false)}
							/>
							<DetailModeButton
								active={showRaw}
								label="원본"
								onClick={() => setShowRaw(true)}
							/>
						</div>
					</div>
				)}

				<div className="workbench-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
					{state.loading ? (
						<div className="flex min-h-80 items-center justify-center gap-3 text-sm text-zinc-500">
							<LoaderCircle className="h-5 w-5 animate-spin" />
							<span>상세 내용을 불러오는 중입니다</span>
						</div>
					) : state.error ? (
						<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
							{state.error}
						</div>
					) : state.detail ? (
						showRaw ? (
							<pre className="workbench-scrollbar overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-800">
								{state.detail.markdown}
							</pre>
						) : (
							<div
								className={cn(
									MARKDOWN_PREVIEW_CLASSNAME,
									"break-words [overflow-wrap:anywhere]",
								)}
								// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted local agent configuration markdown rendered server-side
								dangerouslySetInnerHTML={{ __html: state.detail.html }}
							/>
						)
					) : null}
				</div>
			</div>
		</div>
	);
}

function DetailModeButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"rounded-lg px-3 py-1.5 text-xs font-semibold transition",
				active
					? "bg-white text-zinc-900 shadow-sm"
					: "text-zinc-500 hover:text-zinc-800",
			)}
		>
			{label}
		</button>
	);
}

function EmptyResult() {
	return (
		<div className="flex flex-col items-center justify-center py-24 text-center">
			<div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-200 text-zinc-500">
				<SlidersHorizontal className="h-6 w-6" />
			</div>
			<h2 className="mt-5 text-lg font-semibold text-zinc-700">
				표시할 설정이 없습니다
			</h2>
			<p className="mt-2 text-sm text-zinc-500">
				검색어 또는 에이전트 필터를 조정해보세요.
			</p>
		</div>
	);
}

function AgentSettingsSkeleton() {
	return (
		<AppShell>
			<div className="min-h-[calc(100vh-3rem)] bg-white px-5 py-8 sm:px-8 lg:px-12">
				<div className="mx-auto max-w-7xl">
					<div className="h-9 w-56 rounded-xl bg-zinc-100" />
					<div className="mt-3 h-5 w-full max-w-xl rounded bg-zinc-100" />
					<div className="mt-8 flex gap-3">
						<div className="h-10 w-24 rounded-xl bg-zinc-100" />
						<div className="h-10 w-24 rounded-xl bg-zinc-100" />
						<div className="h-10 w-24 rounded-xl bg-zinc-100" />
					</div>
					<div className="mt-7 divide-y divide-zinc-100">
						{[0, 1, 2, 3, 4].map((index) => (
							<div key={index} className="flex items-center gap-5 py-5">
								<div className="h-12 w-12 rounded-full bg-zinc-100" />
								<div className="min-w-0 flex-1">
									<div className="h-5 w-44 rounded bg-zinc-100" />
									<div className="mt-2 h-4 w-full max-w-2xl rounded bg-zinc-100" />
								</div>
								<div className="h-8 w-14 rounded-full bg-zinc-100" />
							</div>
						))}
					</div>
				</div>
			</div>
		</AppShell>
	);
}

function getKindIcon(kind: AgentSettingsKind) {
	switch (kind) {
		case "hook":
			return <SlidersHorizontal className="h-5 w-5" />;
		case "rule":
			return <ShieldCheck className="h-5 w-5" />;
		case "skill":
			return <Box className="h-5 w-5" />;
	}
}

function getKindLabel(kind: AgentSettingsKind) {
	switch (kind) {
		case "hook":
			return "훅";
		case "rule":
			return "룰";
		case "skill":
			return "스킬";
	}
}

function getAgentLabel(agent: AgentSettingsAgent) {
	switch (agent) {
		case "claude":
			return "Claude";
		case "codex":
			return "Codex";
		case "cursor":
			return "Cursor";
		case "gemini":
			return "Gemini";
		case "shared":
			return "공용";
	}
}

function getProjectLabel(project: AgentSettingsProject) {
	switch (project) {
		case "personal":
			return "개인";
		case "workspace":
			return "현재 작업공간";
	}
}

function getScopeLabel(scope: AgentSettingsScope) {
	return scope === "project" ? "프로젝트" : "개인";
}
