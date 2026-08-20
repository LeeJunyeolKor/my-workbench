import { Link } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Search, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AppShell } from "#/components/layout/AppShell";
import { Pill } from "#/components/ui/Pill";
import { cn } from "#/lib/cn";
import type {
	OperationsConsoleItem,
	OperationsConsoleKind,
	OperationsConsoleMetric,
	OperationsConsoleSourceState,
	OperationsConsoleViewModel,
} from "#/lib/operations-console";

type ActiveView = "all" | OperationsConsoleKind;

export function OperationsConsolePage({
	data,
}: {
	data: OperationsConsoleViewModel;
}) {
	const [activeView, setActiveView] = useState<ActiveView>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedKey, setSelectedKey] = useState<string | null>(
		data.items[0]?.key ?? null,
	);

	const visibleItems = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		return data.items.filter((item) => {
			if (activeView !== "all" && item.kind !== activeView) return false;
			if (!query) return true;
			return [item.id, item.title, item.status, item.source, item.detail]
				.join(" ")
				.toLowerCase()
				.includes(query);
		});
	}, [activeView, data.items, searchQuery]);

	const selectedItem =
		visibleItems.find((item) => item.key === selectedKey) ??
		visibleItems[0] ??
		null;
	const counts = useMemo(
		() => ({
			all: data.items.length,
			task: data.items.filter((item) => item.kind === "task").length,
			plan: data.items.filter((item) => item.kind === "plan").length,
		}),
		[data.items],
	);

	return (
		<AppShell>
			<div className="min-h-[calc(100vh-3rem)] bg-[#f6f8fa] text-[#24292f] dark:bg-[#0d1117] dark:text-[#e6edf3]">
				<div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
					<header className="flex items-start gap-3 border-b border-[#d0d7de] pb-4 dark:border-[#30363d]">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d0d7de] bg-white text-[#0969da] shadow-sm dark:border-[#1f6feb]/35 dark:bg-[#10223a] dark:text-[#58a6ff]">
							<LayoutDashboard className="h-5 w-5" />
						</div>
						<div>
							<h1 className="text-xl font-semibold leading-7 text-[#1f2328] dark:text-[#f0f6fc]">
								업무 콘솔
							</h1>
							<p className="mt-0.5 text-sm text-[#57606a] dark:text-[#8b949e]">
								로컬 작업과 구현 계획을 한곳에서 확인합니다.
							</p>
						</div>
					</header>

					<section className="grid gap-3 sm:grid-cols-2">
						{data.metrics.map((metric) => (
							<MetricCard key={metric.key} metric={metric} />
						))}
					</section>

					<div className="grid min-h-[560px] gap-4 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
						<FilterRail
							activeView={activeView}
							counts={counts}
							sources={data.sources}
							onChange={setActiveView}
						/>

						<section className="min-w-0 overflow-hidden rounded-lg border border-[#d0d7de] bg-white shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
							<div className="flex flex-col gap-3 border-b border-[#d8dee4] px-4 py-3 dark:border-[#30363d] sm:flex-row sm:items-center sm:justify-between">
								<div className="flex items-center gap-2">
									<ListChecks className="h-4 w-4 text-[#57606a] dark:text-[#8b949e]" />
									<h2 className="text-sm font-semibold text-[#1f2328] dark:text-[#f0f6fc]">
										작업 큐
									</h2>
									<Pill variant="status" tone="neutral">
										{visibleItems.length}개
									</Pill>
								</div>
								<label className="relative min-w-[220px] sm:max-w-sm sm:flex-1">
									<span className="sr-only">작업과 계획 검색</span>
									<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e7781] dark:text-[#8b949e]" />
									<input
										type="search"
										placeholder="작업과 계획 검색"
										value={searchQuery}
										onChange={(event) => setSearchQuery(event.target.value)}
										className="h-9 w-full rounded-md border border-[#d0d7de] bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-[#8c959f] focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/15 dark:border-[#30363d] dark:bg-[#0d1117] dark:focus:border-[#58a6ff]"
									/>
								</label>
							</div>

							<div className="overflow-x-auto">
								<table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
									<thead>
										<tr className="bg-[#f6f8fa] text-xs font-semibold text-[#57606a] dark:bg-[#0d1117] dark:text-[#8b949e]">
											<th className="border-b border-[#d8dee4] px-4 py-2.5 dark:border-[#30363d]">
												항목
											</th>
											<th className="border-b border-[#d8dee4] px-3 py-2.5 dark:border-[#30363d]">
												상태
											</th>
											<th className="border-b border-[#d8dee4] px-3 py-2.5 dark:border-[#30363d]">
												출처
											</th>
											<th className="border-b border-[#d8dee4] px-3 py-2.5 dark:border-[#30363d]">
												진행률
											</th>
											<th className="border-b border-[#d8dee4] px-4 py-2.5 text-right dark:border-[#30363d]">
												업데이트
											</th>
										</tr>
									</thead>
									<tbody>
										{visibleItems.length ? (
											visibleItems.map((item) => (
												<ConsoleRow
													key={item.key}
													item={item}
													selected={item.key === selectedItem?.key}
													onSelect={() => setSelectedKey(item.key)}
												/>
											))
										) : (
											<EmptyRows
												hasSourceIssue={data.sources.some(
													(source) => source.status === "unavailable",
												)}
											/>
										)}
									</tbody>
								</table>
							</div>
						</section>

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
	const filters = [
		{ key: "all", label: "전체", icon: <LayoutDashboard /> },
		{ key: "task", label: "작업", icon: <ListChecks /> },
		{ key: "plan", label: "계획", icon: <Workflow /> },
	] as const;

	return (
		<aside className="flex min-w-0 flex-col gap-3 rounded-lg border border-[#d0d7de] bg-white p-3 shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
			<h2 className="text-xs font-semibold uppercase text-[#57606a] dark:text-[#8b949e]">
				보기
			</h2>
			<div className="grid gap-1">
				{filters.map((filter) => (
					<button
						key={filter.key}
						type="button"
						aria-pressed={activeView === filter.key}
						onClick={() => onChange(filter.key)}
						className={cn(
							"flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0969da]",
							activeView === filter.key
								? "bg-[#ddf4ff] text-[#0969da] dark:bg-[#102a43] dark:text-[#79c0ff]"
								: "text-[#57606a] hover:bg-[#f6f8fa] dark:text-[#8b949e] dark:hover:bg-[#21262d]",
						)}
					>
						<span className="[&_svg]:h-4 [&_svg]:w-4">{filter.icon}</span>
						<span className="flex-1 text-left">{filter.label}</span>
						<span className="font-mono text-xs">{counts[filter.key]}</span>
					</button>
				))}
			</div>
			<SourceHealth sources={sources} />
		</aside>
	);
}

function ConsoleRow({
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
				"hover:bg-[#f6f8fa] dark:hover:bg-[#1f2630]",
				selected && "bg-[#ddf4ff] dark:bg-[#102a43]",
			)}
		>
			<td className="border-b border-[#d8dee4] px-4 py-3 dark:border-[#30363d]">
				<button
					type="button"
					onClick={onSelect}
					className="block max-w-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0969da]"
				>
					<span className="font-mono text-xs font-semibold text-[#0969da] dark:text-[#58a6ff]">
						{item.id}
					</span>
					<span className="mt-1 block line-clamp-1 font-semibold text-[#1f2328] dark:text-[#f0f6fc]">
						{item.title}
					</span>
					<span className="mt-1 block line-clamp-1 text-xs text-[#57606a] dark:text-[#8b949e]">
						{item.detail}
					</span>
				</button>
			</td>
			<td className="border-b border-[#d8dee4] px-3 py-3 align-top dark:border-[#30363d]">
				<Pill variant="status" tone={item.statusTone}>
					{item.status}
				</Pill>
			</td>
			<td className="border-b border-[#d8dee4] px-3 py-3 align-top font-mono text-xs text-[#57606a] dark:border-[#30363d] dark:text-[#8b949e]">
				{item.source}
			</td>
			<td className="border-b border-[#d8dee4] px-3 py-3 align-top dark:border-[#30363d]">
				<div className="h-2 w-28 overflow-hidden rounded-full bg-[#d8dee4] dark:bg-[#30363d]">
					<div
						className="h-full rounded-full bg-[#0969da] dark:bg-[#58a6ff]"
						style={{ width: `${item.progress}%` }}
					/>
				</div>
				<div className="mt-1 text-xs text-[#57606a] dark:text-[#8b949e]">
					{item.progress}%
				</div>
			</td>
			<td className="border-b border-[#d8dee4] px-4 py-3 text-right align-top text-xs text-[#57606a] dark:border-[#30363d] dark:text-[#8b949e]">
				{item.updated}
			</td>
		</tr>
	);
}

function EmptyRows({ hasSourceIssue }: { hasSourceIssue: boolean }) {
	return (
		<tr>
			<td colSpan={5} className="px-4 py-12 text-center">
				<p className="text-sm font-semibold">표시할 항목이 없습니다.</p>
				<p className="mt-1 text-xs text-[#57606a] dark:text-[#8b949e]">
					{hasSourceIssue
						? "데이터 소스 상태를 확인하거나 데스크톱 앱에서 실행하세요."
						: "검색어나 보기를 조정해 보세요."}
				</p>
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
	return (
		<aside className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-[#d0d7de] bg-white shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
			<div className="border-b border-[#d8dee4] px-4 py-3 dark:border-[#30363d]">
				<h2 className="text-sm font-semibold">상세</h2>
			</div>
			{item ? (
				<div className="flex flex-1 flex-col p-4">
					<div className="flex items-center justify-between gap-2">
						<Pill
							variant="status"
							tone={item.kind === "task" ? "blue" : "violet"}
						>
							{kindLabel(item.kind)}
						</Pill>
						<Pill variant="status" tone={item.statusTone}>
							{item.status}
						</Pill>
					</div>
					<h3 className="mt-3 text-sm font-semibold leading-6">{item.title}</h3>
					<p className="mt-2 text-sm leading-6 text-[#57606a] dark:text-[#8b949e]">
						{item.detail}
					</p>
					<dl className="mt-4 grid gap-3 rounded-md border border-[#d8dee4] p-3 text-xs dark:border-[#30363d]">
						<DetailRow label="ID" value={item.id} />
						<DetailRow label="출처" value={item.source} />
						<DetailRow label="진행률" value={`${item.progress}%`} />
						<DetailRow label="업데이트" value={item.updated} />
					</dl>
					<ItemLink item={item} />
				</div>
			) : (
				<div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[#57606a] dark:text-[#8b949e]">
					선택할 항목이 없습니다.
				</div>
			)}
			<div className="border-t border-[#d8dee4] p-4 dark:border-[#30363d]">
				<SourceHealth sources={sources} compact />
			</div>
		</aside>
	);
}

function ItemLink({ item }: { item: OperationsConsoleItem }) {
	const className =
		"mt-auto inline-flex h-9 items-center justify-center rounded-md bg-[#0969da] px-3 text-sm font-semibold text-white transition hover:bg-[#0759b8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0969da] dark:bg-[#1f6feb]";
	if (item.kind === "task") {
		return (
			<Link to="/tasks" className={className}>
				작업 보드 열기
			</Link>
		);
	}
	return (
		<Link
			to="/plans/$taskId"
			params={{ taskId: item.id }}
			className={className}
		>
			계획 열기
		</Link>
	);
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
			<dt className="font-semibold text-[#6e7781] dark:text-[#8b949e]">
				{label}
			</dt>
			<dd className="break-words text-[#24292f] dark:text-[#e6edf3]">
				{value}
			</dd>
		</div>
	);
}

function MetricCard({ metric }: { metric: OperationsConsoleMetric }) {
	const icon: ReactNode =
		metric.key === "tasks" ? <ListChecks /> : <Workflow />;
	return (
		<div className="rounded-lg border border-[#d0d7de] bg-white p-4 shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-xs font-semibold uppercase text-[#57606a] dark:text-[#8b949e]">
						{metric.label}
					</div>
					<div className="mt-2 text-2xl font-semibold leading-none">
						{metric.value}
					</div>
					<div className="mt-2 text-xs text-[#57606a] dark:text-[#8b949e]">
						{metric.detail}
					</div>
				</div>
				<div
					className={cn(
						"flex h-9 w-9 items-center justify-center rounded-md border [&_svg]:h-4 [&_svg]:w-4",
						metric.tone === "blue"
							? "border-[#54aeff]/35 bg-[#ddf4ff] text-[#0969da] dark:border-[#58a6ff]/40 dark:bg-[#102a43] dark:text-[#79c0ff]"
							: "border-[#a475f9]/35 bg-[#fbefff] text-[#8250df] dark:border-[#a371f7]/45 dark:bg-[#2d2147] dark:text-[#d2a8ff]",
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
				데이터 소스
			</h3>
			<div className="grid gap-1.5">
				{sources.map((source) => (
					<div
						key={source.key}
						className="flex items-center justify-between gap-2 text-xs"
					>
						<span className="font-medium text-[#57606a] dark:text-[#8b949e]">
							{source.label}
						</span>
						<div className="flex items-center gap-1.5">
							<span className="font-mono text-[#6e7781] dark:text-[#8b949e]">
								{source.count}
							</span>
							<Pill
								variant="status"
								tone={source.status === "ok" ? "green" : "red"}
							>
								{source.status === "ok" ? "사용 가능" : "사용 불가"}
							</Pill>
						</div>
					</div>
				))}
			</div>
			{sources.some((source) => source.message) ? (
				<div className="mt-2 rounded-md border border-[#d4a72c]/35 bg-[#fff8c5] px-2 py-1.5 text-xs leading-5 text-[#9a6700] dark:border-[#d29922]/45 dark:bg-[#3d2f12] dark:text-[#f2cc60]">
					{sources
						.filter((source) => source.message)
						.map((source) => `${source.label}: ${source.message}`)
						.join(" · ")}
				</div>
			) : null}
		</div>
	);
}

function kindLabel(kind: OperationsConsoleKind) {
	return kind === "task" ? "작업" : "계획";
}
