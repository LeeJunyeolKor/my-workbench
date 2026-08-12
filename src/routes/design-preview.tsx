import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowRight,
	Box,
	Clock3,
	Command,
	ExternalLink,
	GitBranch,
	LayoutDashboard,
	ListChecks,
	ListFilter,
	PanelRight,
	Search,
	ShieldCheck,
	Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "#/components/layout/AppShell";
import { Pill } from "#/components/ui/Pill";
import { cn } from "#/lib/cn";
import type {
	OperationsConsoleItem,
	OperationsConsoleKind,
	OperationsConsoleMetric,
	OperationsConsoleSourceState,
	OperationsConsoleTone,
	OperationsConsoleViewModel,
} from "#/lib/operations-console";
import { getOperationsConsoleData } from "#/server/operations-console";

export const Route = createFileRoute("/design-preview")({
	loader: () => getOperationsConsoleData(),
	component: DesignPreviewPage,
});

type ActiveView = "queue" | "tasks" | "connectors" | "plans" | "worktrees";
type Tone = OperationsConsoleTone;

function DesignPreviewPage() {
	const data = Route.useLoaderData();
	return <OperationsConsolePage data={data} />;
}

export function OperationsConsolePage({
	data,
}: {
	data: OperationsConsoleViewModel;
}) {
	const [selectedKey, setSelectedKey] = useState<string | null>(
		data.items[0]?.key ?? null,
	);
	const [activeView, setActiveView] = useState<ActiveView>("queue");
	const [searchQuery, setSearchQuery] = useState("");

	const visibleRows = useMemo(() => {
		const normalizedQuery = searchQuery.trim().toLowerCase();
		return data.items.filter((item) => {
			const matchesView =
				activeView === "queue" ||
				(activeView === "tasks" && item.kind === "task") ||
				(activeView === "connectors" && item.kind === "connector") ||
				(activeView === "plans" && item.kind === "plan") ||
				(activeView === "worktrees" && item.kind === "worktree");
			if (!matchesView) return false;
			if (!normalizedQuery) return true;
			return [
				item.id,
				item.repo,
				item.title,
				item.status,
				item.source,
				item.target,
				item.reviewer,
			]
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery);
		});
	}, [activeView, data.items, searchQuery]);

	const selectedItem =
		visibleRows.find((item) => item.key === selectedKey) ??
		data.items.find((item) => item.key === selectedKey) ??
		visibleRows[0] ??
		data.items[0] ??
		null;

	useEffect(() => {
		if (selectedItem?.key === selectedKey) return;
		setSelectedKey(selectedItem?.key ?? null);
	}, [selectedItem, selectedKey]);

	const counts = useMemo(
		() => ({
			queue: data.items.length,
			tasks: data.items.filter((item) => item.kind === "task").length,
			connectors: data.items.filter((item) => item.kind === "connector").length,
			plans: data.items.filter((item) => item.kind === "plan").length,
			worktrees: data.items.filter((item) => item.kind === "worktree").length,
		}),
		[data.items],
	);

	return (
		<AppShell>
			<div className="min-h-[calc(100vh-3rem)] bg-[#f6f8fa] text-[#24292f] dark:bg-[#0d1117] dark:text-[#e6edf3]">
				<div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
					<header className="flex flex-col gap-3 border-b border-[#d0d7de] pb-4 dark:border-[#30363d] xl:flex-row xl:items-center xl:justify-between">
						<div className="flex min-w-0 items-start gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d0d7de] bg-white text-[#0969da] shadow-[0_1px_2px_rgba(31,35,40,0.04)] dark:border-[#1f6feb]/35 dark:bg-[#10223a] dark:text-[#58a6ff]">
								<LayoutDashboard className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<h1 className="text-xl font-semibold leading-7 text-[#1f2328] dark:text-[#f0f6fc]">
									업무 콘솔
								</h1>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<PreviewButton
								tone="ghost"
								icon={<Command />}
								onClick={() => {
									const commandPalette = window.myWorkbenchCommandPalette;
									if (commandPalette) {
										commandPalette.toggle();
										return;
									}
									window.dispatchEvent(new Event("toggle-command-palette"));
								}}
							>
								Command
							</PreviewButton>
						</div>
					</header>

					<section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						{data.metrics.map((metric) => (
							<MetricCard
								key={metric.key}
								metric={metric}
								icon={metricIcon(metric.key)}
							/>
						))}
					</section>

					<div className="grid min-h-[620px] gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
						<FilterRail
							activeView={activeView}
							counts={counts}
							sources={data.sources}
							onChange={setActiveView}
						/>

						<main className="min-w-0 rounded-lg border border-[#d0d7de] bg-white shadow-[0_1px_2px_rgba(31,35,40,0.04)] dark:border-[#30363d] dark:bg-[#161b22]">
							<div className="flex flex-col gap-3 border-b border-[#d8dee4] px-4 py-3 dark:border-[#30363d] lg:flex-row lg:items-center lg:justify-between">
								<div className="flex min-w-0 items-center gap-2">
									<ListFilter className="h-4 w-4 text-[#57606a] dark:text-[#8b949e]" />
									<h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#f0f6fc]">
										작업 큐
									</h2>
									<Pill variant="status" tone="neutral">
										{visibleRows.length} items
									</Pill>
								</div>
								<div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
									<div className="relative min-w-[220px] flex-1 lg:max-w-sm">
										<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e7781] dark:text-[#8b949e]" />
										<input
											type="search"
											placeholder="작업, 브랜치, 계획 검색"
											value={searchQuery}
											onChange={(event) => setSearchQuery(event.target.value)}
											className="h-9 w-full rounded-md border border-[#d0d7de] bg-white pl-9 pr-3 text-sm text-[#24292f] outline-none transition placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/15 dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#e6edf3] dark:placeholder:text-[#6e7681] dark:focus:border-[#58a6ff] dark:focus:ring-[#58a6ff]/20"
										/>
									</div>
								</div>
							</div>

							<div className="overflow-x-auto">
								<table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
									<thead>
										<tr className="bg-[#f6f8fa] text-xs font-semibold text-[#57606a] dark:bg-[#0d1117] dark:text-[#8b949e]">
											<th className="border-b border-[#d8dee4] px-4 py-2.5 dark:border-[#30363d]">
												작업
											</th>
											<th className="border-b border-[#d8dee4] px-3 py-2.5 dark:border-[#30363d]">
												상태
											</th>
											<th className="border-b border-[#d8dee4] px-3 py-2.5 dark:border-[#30363d]">
												브랜치
											</th>
											<th className="border-b border-[#d8dee4] px-3 py-2.5 dark:border-[#30363d]">
												검증
											</th>
											<th className="border-b border-[#d8dee4] px-3 py-2.5 dark:border-[#30363d]">
												계획
											</th>
											<th className="border-b border-[#d8dee4] px-4 py-2.5 text-right dark:border-[#30363d]">
												업데이트
											</th>
										</tr>
									</thead>
									<tbody>
										{visibleRows.length > 0 ? (
											visibleRows.map((item) => (
												<QueueRow
													key={item.key}
													item={item}
													selected={item.key === selectedItem?.key}
													onSelect={() => setSelectedKey(item.key)}
												/>
											))
										) : (
											<EmptyRows
												hasSourceIssue={data.sources.some(
													(source) => source.status !== "ok",
												)}
											/>
										)}
									</tbody>
								</table>
							</div>
						</main>

						<DetailPanel item={selectedItem} sources={data.sources} />
					</div>
				</div>
			</div>
		</AppShell>
	);
}

function FilterRail({
	activeView,
	counts,
	sources,
	onChange,
}: {
	activeView: ActiveView;
	counts: Record<ActiveView, number>;
	sources: OperationsConsoleSourceState[];
	onChange: (view: ActiveView) => void;
}) {
	return (
		<aside className="flex min-w-0 flex-col gap-3 rounded-lg border border-[#d0d7de] bg-white p-3 shadow-[0_1px_2px_rgba(31,35,40,0.04)] dark:border-[#30363d] dark:bg-[#161b22]">
			<div className="flex items-center justify-between">
				<h2 className="text-xs font-semibold uppercase text-[#57606a] dark:text-[#8b949e]">
					Workspace
				</h2>
				<PreviewIconButton label="패널 접기" icon={<PanelRight />} />
			</div>

			<div className="grid gap-1">
				<RailButton
					active={activeView === "queue"}
					icon={<LayoutDashboard />}
					label="작업 큐"
					count={counts.queue}
					onClick={() => onChange("queue")}
				/>
				<RailButton
					active={activeView === "tasks"}
					icon={<ListChecks />}
					label="로컬 작업"
					count={counts.tasks}
					onClick={() => onChange("tasks")}
				/>
				<RailButton
					active={activeView === "connectors"}
					icon={<Box />}
					label="커넥터"
					count={counts.connectors}
					onClick={() => onChange("connectors")}
				/>
				<RailButton
					active={activeView === "plans"}
					icon={<Workflow />}
					label="계획"
					count={counts.plans}
					onClick={() => onChange("plans")}
				/>
				<RailButton
					active={activeView === "worktrees"}
					icon={<GitBranch />}
					label="워크트리"
					count={counts.worktrees}
					onClick={() => onChange("worktrees")}
				/>
			</div>

			<SourceHealth sources={sources} />
		</aside>
	);
}

function QueueRow({
	item,
	selected,
	onSelect,
}: {
	item: OperationsConsoleItem;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<tr
			className={cn(
				"group cursor-pointer transition hover:bg-[#f6f8fa] dark:hover:bg-[#1f2630]",
				selected && "bg-[#ddf4ff] dark:bg-[#102a43]",
			)}
			onClick={onSelect}
		>
			<td className="border-b border-[#d8dee4] px-4 py-3 align-top dark:border-[#30363d]">
				<div className="flex min-w-0 items-start gap-3">
					<div
						className={cn(
							"mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
							selected
								? "border-[#0969da]/30 bg-white text-[#0969da] dark:border-[#58a6ff]/45 dark:bg-[#0d1117] dark:text-[#58a6ff]"
								: "border-[#d0d7de] bg-[#f6f8fa] text-[#57606a] dark:border-[#30363d] dark:bg-[#21262d] dark:text-[#8b949e]",
						)}
					>
						{itemKindIcon(item.kind)}
					</div>
					<div className="min-w-0">
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<span className="font-mono text-xs font-semibold text-[#0969da]">
								{item.id}
							</span>
							<Pill variant="status" tone="neutral">
								{item.repo}
							</Pill>
						</div>
						<button
							type="button"
							className="mt-1 line-clamp-1 max-w-xl text-left text-sm font-semibold text-[#1f2328] transition group-hover:text-[#0969da] dark:text-[#f0f6fc] dark:group-hover:text-[#79c0ff]"
						>
							{item.title}
						</button>
						<div className="mt-1 flex items-center gap-1.5 text-xs text-[#57606a] dark:text-[#8b949e]">
							<Clock3 className="h-3.5 w-3.5" />
							<span>{item.updated}</span>
							<span>·</span>
							<span>risk {item.risk}</span>
						</div>
					</div>
				</div>
			</td>
			<td className="border-b border-[#d8dee4] px-3 py-3 align-top dark:border-[#30363d]">
				<div className="flex flex-col gap-1.5">
					<Pill variant="status" tone={item.statusTone}>
						{item.status}
					</Pill>
					<span className="text-xs text-[#57606a] dark:text-[#8b949e]">
						{item.reviewer}
					</span>
				</div>
			</td>
			<td className="border-b border-[#d8dee4] px-3 py-3 align-top dark:border-[#30363d]">
				<div className="flex max-w-[260px] items-center gap-1.5 font-mono text-xs">
					<GitBranch className="h-3.5 w-3.5 shrink-0 text-[#57606a] dark:text-[#8b949e]" />
					<span className="truncate text-[#0969da] dark:text-[#58a6ff]">
						{item.source}
					</span>
				</div>
				<div className="mt-1 flex max-w-[260px] items-center gap-1.5 font-mono text-xs text-[#57606a] dark:text-[#8b949e]">
					<ArrowRight className="h-3.5 w-3.5 shrink-0" />
					<span className="truncate">{item.target}</span>
				</div>
			</td>
			<td className="border-b border-[#d8dee4] px-3 py-3 align-top dark:border-[#30363d]">
				<Pill variant="status" tone={item.ciTone}>
					{item.ci}
				</Pill>
				<div className="mt-1 text-xs text-[#57606a] dark:text-[#8b949e]"></div>
			</td>
			<td className="border-b border-[#d8dee4] px-3 py-3 align-top dark:border-[#30363d]">
				<div className="h-2 w-28 overflow-hidden rounded-full bg-[#d8dee4] dark:bg-[#30363d]">
					<div
						className="h-full rounded-full bg-[#0969da] dark:bg-[#58a6ff]"
						style={{ width: `${item.planProgress}%` }}
					/>
				</div>
				<div className="mt-1 text-xs text-[#57606a] dark:text-[#8b949e]">
					{item.planProgress}% complete
				</div>
			</td>
			<td className="border-b border-[#d8dee4] px-4 py-3 text-right align-top dark:border-[#30363d]">
				<PreviewIconButton
					label="관련 화면 열기"
					icon={<ExternalLink />}
					href={item.url}
				/>
			</td>
		</tr>
	);
}

function EmptyRows({ hasSourceIssue }: { hasSourceIssue: boolean }) {
	return (
		<tr>
			<td
				colSpan={6}
				className="border-b border-[#d8dee4] px-4 py-12 text-center dark:border-[#30363d]"
			>
				<div className="text-sm font-semibold text-[#1f2328] dark:text-[#f0f6fc]">
					표시할 운영 항목이 없습니다.
				</div>
				<div className="mt-1 text-xs text-[#57606a] dark:text-[#8b949e]">
					{hasSourceIssue
						? "일부 데이터 소스를 읽지 못했습니다. 좌측 데이터 상태를 확인하세요."
						: "검색어나 선택한 뷰를 조정해 보세요."}
				</div>
			</td>
		</tr>
	);
}

function DetailPanel({
	item,
	sources,
}: {
	item: OperationsConsoleItem | null;
	sources: OperationsConsoleSourceState[];
}) {
	if (!item) {
		return (
			<aside className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-[#d0d7de] bg-white shadow-[0_1px_2px_rgba(31,35,40,0.04)] dark:border-[#30363d] dark:bg-[#161b22]">
				<div className="border-b border-[#d8dee4] px-4 py-3 dark:border-[#30363d]">
					<h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#f0f6fc]">
						작업 상세
					</h2>
				</div>
				<div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[#57606a] dark:text-[#8b949e]">
					실제 데이터가 들어오면 선택한 행의 상세 정보가 표시됩니다.
				</div>
				<div className="border-t border-[#d8dee4] p-4 dark:border-[#30363d]">
					<SourceHealth sources={sources} compact />
				</div>
			</aside>
		);
	}

	return (
		<aside className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-[#d0d7de] bg-white shadow-[0_1px_2px_rgba(31,35,40,0.04)] dark:border-[#30363d] dark:bg-[#161b22]">
			<div className="border-b border-[#d8dee4] px-4 py-3 dark:border-[#30363d]">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#f0f6fc]">
						작업 상세
					</h2>
					<Pill variant="status" tone={item.statusTone}>
						{item.status}
					</Pill>
				</div>
				<p className="mt-2 text-sm font-semibold leading-6 text-[#1f2328] dark:text-[#e6edf3]">
					{item.title}
				</p>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					<Pill variant="status" tone="blue">
						{item.id}
					</Pill>
					<Pill variant="status" tone="neutral">
						{item.repo}
					</Pill>
				</div>
			</div>

			<div className="flex-1 space-y-4 overflow-y-auto p-4">
				<section>
					<h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#57606a] dark:text-[#8b949e]">
						<Workflow className="h-3.5 w-3.5" />
						작업 요약
					</h3>
					<div className="rounded-md border border-[#d8dee4] dark:border-[#30363d]">
						<DetailRow label="소스" value={item.reviewer} />
						<DetailRow label="검증" value={item.ci}>
							<Pill variant="status" tone={item.ciTone}>
								{item.ci}
							</Pill>
						</DetailRow>
						<DetailRow label="위험도" value={item.risk} />
						<DetailRow label="업데이트" value={item.updated} />
					</div>
				</section>

				<section className="rounded-md border border-[#d8dee4] bg-[#f6f8fa] p-3 dark:border-[#30363d] dark:bg-[#0d1117]">
					<h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#57606a] dark:text-[#8b949e]">
						<GitBranch className="h-3.5 w-3.5" />
						브랜치
					</h3>
					<div className="space-y-2 text-sm">
						<div>
							<div className="text-xs font-semibold text-[#6e7781] dark:text-[#8b949e]">
								source
							</div>
							<div className="mt-0.5 break-words font-mono text-xs leading-5 text-[#0969da] dark:text-[#58a6ff]">
								{item.source}
							</div>
						</div>
						<div>
							<div className="text-xs font-semibold text-[#6e7781] dark:text-[#8b949e]">
								target
							</div>
							<div className="mt-0.5 break-words font-mono text-xs leading-5 text-[#24292f] dark:text-[#e6edf3]">
								{item.target}
							</div>
						</div>
					</div>
				</section>

				<section>
					<h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[#57606a] dark:text-[#8b949e]">
						<ShieldCheck className="h-3.5 w-3.5" />
						데이터 상태
					</h3>
					<SourceHealth sources={sources} compact />
				</section>
			</div>
		</aside>
	);
}

function MetricCard({
	icon,
	metric,
}: {
	icon: ReactNode;
	metric: OperationsConsoleMetric;
}) {
	return (
		<div className="rounded-lg border border-[#d0d7de] bg-white p-4 shadow-[0_1px_2px_rgba(31,35,40,0.04)] dark:border-[#30363d] dark:bg-[#161b22]">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-xs font-semibold uppercase text-[#57606a] dark:text-[#8b949e]">
						{metric.label}
					</div>
					<div className="mt-2 text-2xl font-semibold leading-none text-[#1f2328] dark:text-[#f0f6fc]">
						{metric.value}
					</div>
					<div className="mt-2 text-xs text-[#57606a] dark:text-[#8b949e]">
						{metric.detail}
					</div>
				</div>
				<div
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-md border [&_svg]:h-4 [&_svg]:w-4",
						toneIconClassName(metric.tone),
					)}
				>
					{icon}
				</div>
			</div>
		</div>
	);
}

function SourceHealth({
	sources,
	compact = false,
}: {
	sources: OperationsConsoleSourceState[];
	compact?: boolean;
}) {
	return (
		<div
			className={cn(
				"border-t border-[#d8dee4] pt-3 dark:border-[#30363d]",
				compact && "border-t-0 pt-0",
			)}
		>
			<h3 className="mb-2 text-xs font-semibold uppercase text-[#57606a] dark:text-[#8b949e]">
				Data sources
			</h3>
			<div className="grid gap-1.5">
				{sources.map((source) => (
					<div
						key={source.key}
						className="flex min-w-0 items-center justify-between gap-2 text-xs"
					>
						<span className="min-w-0 truncate font-medium text-[#57606a] dark:text-[#8b949e]">
							{source.label}
						</span>
						<div className="flex shrink-0 items-center gap-1.5">
							<span className="font-mono text-[#6e7781] dark:text-[#8b949e]">
								{source.count}
							</span>
							<Pill variant="status" tone={sourceStatusTone(source.status)}>
								{sourceStatusLabel(source.status)}
							</Pill>
						</div>
					</div>
				))}
			</div>
			{sources.some((source) => source.message) && (
				<div className="mt-2 rounded-md border border-[#d4a72c]/35 bg-[#fff8c5] px-2 py-1.5 text-xs leading-5 text-[#9a6700] dark:border-[#d29922]/45 dark:bg-[#3d2f12] dark:text-[#f2cc60]">
					{sources
						.filter((source) => source.message)
						.map((source) => `${source.label}: ${source.message}`)
						.join(" · ")}
				</div>
			)}
		</div>
	);
}

function RailButton({
	active,
	icon,
	label,
	count,
	onClick,
}: {
	active: boolean;
	icon: ReactNode;
	label: string;
	count: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition",
				active
					? "bg-[#ddf4ff] text-[#0969da] dark:bg-[#102a43] dark:text-[#79c0ff]"
					: "text-[#57606a] hover:bg-[#f6f8fa] hover:text-[#24292f] dark:text-[#8b949e] dark:hover:bg-[#21262d] dark:hover:text-[#e6edf3]",
			)}
		>
			<span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
				{icon}
			</span>
			<span className="min-w-0 flex-1 truncate text-left">{label}</span>
			<span
				className={cn(
					"rounded-full px-1.5 py-0.5 text-[11px]",
					active
						? "bg-white text-[#0969da] dark:bg-[#0d1117] dark:text-[#79c0ff]"
						: "bg-[#f6f8fa] text-[#6e7781] dark:bg-[#21262d] dark:text-[#8b949e]",
				)}
			>
				{count}
			</span>
		</button>
	);
}

function PreviewButton({
	children,
	icon,
	onClick,
	tone = "primary",
}: {
	children: ReactNode;
	icon?: ReactNode;
	onClick?: () => void;
	tone?: "primary" | "ghost";
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
				tone === "primary"
					? "border-[#0969da] bg-[#0969da] text-white hover:bg-[#0759b8] dark:border-[#58a6ff] dark:bg-[#1f6feb] dark:hover:bg-[#388bfd]"
					: "border-[#d0d7de] bg-white text-[#24292f] hover:bg-[#f6f8fa] dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#e6edf3] dark:hover:bg-[#21262d]",
			)}
		>
			{icon && (
				<span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
					{icon}
				</span>
			)}
			<span>{children}</span>
		</button>
	);
}

function PreviewIconButton({
	label,
	icon,
	href,
}: {
	label: string;
	icon: ReactNode;
	href?: string;
}) {
	const className =
		"inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[#57606a] transition hover:border-[#d0d7de] hover:bg-white hover:text-[#24292f] dark:text-[#8b949e] dark:hover:border-[#30363d] dark:hover:bg-[#21262d] dark:hover:text-[#e6edf3]";
	const content = (
		<span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
			{icon}
		</span>
	);
	if (href) {
		return (
			<a
				href={href}
				aria-label={label}
				title={label}
				className={className}
				onClick={(event) => event.stopPropagation()}
			>
				{content}
			</a>
		);
	}

	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={className}
		>
			{content}
		</button>
	);
}

function DetailRow({
	children,
	label,
	value,
}: {
	children?: ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-[#d8dee4] px-3 py-2.5 last:border-b-0 dark:border-[#30363d]">
			<div className="text-xs font-semibold text-[#6e7781] dark:text-[#8b949e]">
				{label}
			</div>
			<div className="min-w-0 text-sm font-medium text-[#24292f] dark:text-[#e6edf3]">
				{children ?? value}
			</div>
		</div>
	);
}

function toneIconClassName(tone: Tone | "violet") {
	switch (tone) {
		case "blue":
			return "border-[#54aeff]/35 bg-[#ddf4ff] text-[#0969da] dark:border-[#58a6ff]/40 dark:bg-[#102a43] dark:text-[#79c0ff]";
		case "green":
			return "border-[#4ac26b]/35 bg-[#dafbe1] text-[#1a7f37] dark:border-[#3fb950]/40 dark:bg-[#103d2a] dark:text-[#7ee787]";
		case "amber":
			return "border-[#d4a72c]/35 bg-[#fff8c5] text-[#9a6700] dark:border-[#d29922]/45 dark:bg-[#3d2f12] dark:text-[#f2cc60]";
		case "red":
			return "border-[#ff8182]/35 bg-[#ffebe9] text-[#cf222e] dark:border-[#f85149]/45 dark:bg-[#3d1719] dark:text-[#ff7b72]";
		case "violet":
			return "border-[#a475f9]/35 bg-[#fbefff] text-[#8250df] dark:border-[#a371f7]/45 dark:bg-[#2d2147] dark:text-[#d2a8ff]";
		default:
			return "border-[#d0d7de] bg-[#f6f8fa] text-[#57606a] dark:border-[#30363d] dark:bg-[#21262d] dark:text-[#c9d1d9]";
	}
}

function metricIcon(key: OperationsConsoleMetric["key"]) {
	switch (key) {
		case "tasks":
			return <ListChecks />;
		case "connectors":
			return <Box />;
		case "plans":
			return <Workflow />;
		case "worktrees":
			return <GitBranch />;
		default:
			return <LayoutDashboard />;
	}
}

function itemKindIcon(kind: OperationsConsoleKind) {
	switch (kind) {
		case "task":
			return <ListChecks className="h-4 w-4" />;
		case "connector":
			return <Box className="h-4 w-4" />;
		case "plan":
			return <Workflow className="h-4 w-4" />;
		case "worktree":
			return <GitBranch className="h-4 w-4" />;
		default:
			return <LayoutDashboard className="h-4 w-4" />;
	}
}

function sourceStatusTone(
	status: OperationsConsoleSourceState["status"],
): OperationsConsoleTone {
	if (status === "ok") return "green";
	return "red";
}

function sourceStatusLabel(status: OperationsConsoleSourceState["status"]) {
	if (status === "ok") return "ok";
	return "unavailable";
}
