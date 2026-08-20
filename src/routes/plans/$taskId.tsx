import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { AlertCircle, Archive, Check, Edit, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "#/components/layout/AppShell";
import { PlanMarkdown } from "#/components/plans/PlanMarkdown";
import { PlanToc } from "#/components/plans/PlanToc";
import { Pill } from "#/components/ui/Pill";
import { planDocumentClassName } from "#/lib/design-system-classnames";
import { getErrorMessage } from "#/lib/errors";
import { loadPlan, savePlanFile } from "#/lib/local-data-ipc";
import { filterVisiblePlanFiles } from "#/lib/plans/order";
import {
	DESKTOP_RUNTIME_REQUIRED_MESSAGE,
	hasTauriRuntime,
} from "#/lib/tauri-ipc";

interface PlanSearch {
	file?: string;
}

export const Route = createFileRoute("/plans/$taskId")({
	validateSearch: (search: Record<string, unknown>): PlanSearch => ({
		file: typeof search.file === "string" ? search.file : undefined,
	}),
	loader: async ({ params }) => {
		if (!hasTauriRuntime()) {
			return {
				plan: null,
				plansDir: "",
				readOnlyReason: DESKTOP_RUNTIME_REQUIRED_MESSAGE,
			};
		}
		return { ...(await loadPlan(params.taskId)), readOnlyReason: null };
	},
	component: PlanDetailPage,
});

function PlanDetailPage() {
	const { plan, plansDir, readOnlyReason } = Route.useLoaderData();
	const { taskId } = Route.useParams();
	const { file: selectedFilename } = Route.useSearch();
	const navigate = useNavigate({ from: "/plans/$taskId" });
	const router = useRouter();
	const [isEditing, setIsEditing] = useState(false);
	const [editContent, setEditContent] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showArchivedFiles, setShowArchivedFiles] = useState(false);

	const cleanFilename = selectedFilename?.split("#")[0];
	const activeFile =
		plan?.files.find((file) => file.filename === cleanFilename) ??
		plan?.files[0];
	const visibleFiles = useMemo(
		() => filterVisiblePlanFiles(plan?.files ?? [], showArchivedFiles),
		[plan?.files, showArchivedFiles],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: selecting another document must close the previous document's editor.
	useEffect(() => {
		setIsEditing(false);
		setError(null);
	}, [cleanFilename]);

	const handleSelectFile = (filename: string) => {
		void navigate({ search: (previous) => ({ ...previous, file: filename }) });
	};

	const handleSave = async () => {
		if (!activeFile || readOnlyReason) return;
		setIsSaving(true);
		setError(null);
		try {
			await savePlanFile({
				taskId,
				filename: activeFile.filename,
				content: editContent,
				expectedContent: activeFile.content,
			});
			await router.invalidate();
			setIsEditing(false);
		} catch (saveError) {
			setError(getErrorMessage(saveError, "구현 계획을 저장하지 못했습니다."));
		} finally {
			setIsSaving(false);
		}
	};

	if (!plan || !activeFile) {
		return (
			<AppShell variant="board">
				<div className="mx-auto w-full max-w-5xl px-6 py-10">
					<Link
						to="/plans"
						className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-200"
					>
						← 구현 계획 목록
					</Link>
					<div className="mt-8 flex items-start gap-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-6 text-zinc-700 dark:text-zinc-300">
						<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
						<div>
							<h1 className="text-base font-bold">
								{readOnlyReason
									? "데스크톱 앱이 필요합니다"
									: "구현 계획을 찾을 수 없습니다"}
							</h1>
							<p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
								{readOnlyReason ?? `${plansDir}/${taskId}`}
							</p>
						</div>
					</div>
				</div>
			</AppShell>
		);
	}

	const progress =
		activeFile.progressTotal > 0
			? `작업 ${activeFile.progressDone}/${activeFile.progressTotal}`
			: null;

	return (
		<AppShell variant="board">
			<div className="mx-auto w-full max-w-7xl px-6 py-10">
				<Link
					to="/plans"
					className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-200"
				>
					← 구현 계획 목록
				</Link>

				<header className="mt-6 font-mono">
					<div className="flex flex-wrap items-center gap-2">
						<Pill
							variant="status"
							className="font-mono font-bold"
							style={{
								background: `${plan.accent}20`,
								color: plan.accent,
								border: `1px solid ${plan.accent}30`,
							}}
						>
							{plan.taskId}
						</Pill>
						{plan.repo ? (
							<Pill
								variant="status"
								tone="blue"
								className="font-mono font-bold"
							>
								{plan.repo}
							</Pill>
						) : null}
						{progress ? (
							<Pill variant="status" tone="neutral">
								{progress}
							</Pill>
						) : null}
					</div>
					<div className="mt-4 flex flex-wrap items-center justify-between gap-4">
						<h1 className="font-sans text-2xl font-bold leading-snug text-zinc-800 dark:text-white">
							{activeFile.title || plan.title}
						</h1>
						{!isEditing ? (
							<button
								type="button"
								onClick={() => {
									setEditContent(activeFile.content);
									setIsEditing(true);
									setError(null);
								}}
								className="flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-bold text-[#57606a] transition hover:bg-[#f6f8fa] dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#c9d1d9] dark:hover:bg-[#21262d]"
							>
								<Edit className="h-3.5 w-3.5" />
								편집하기
							</button>
						) : null}
					</div>
					{plan.files.length > 1 ? (
						<label className="mt-4 block text-xs font-semibold text-zinc-500 lg:hidden">
							문서
							<select
								value={activeFile.filename}
								onChange={(event) => handleSelectFile(event.target.value)}
								className="mt-1 w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 font-mono text-xs text-zinc-800 dark:border-[#30363d] dark:bg-[#161b22] dark:text-zinc-200"
							>
								{plan.files.map((file) => (
									<option key={file.filename} value={file.filename}>
										{file.filename}
									</option>
								))}
							</select>
						</label>
					) : null}
				</header>

				<div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
					<aside className="hidden space-y-4 lg:block">
						{plan.files.length > 1 ? (
							<section className="rounded-xl border border-[#d0d7de] bg-white p-3 dark:border-[#30363d] dark:bg-[#161b22]">
								<div className="mb-2 flex items-center justify-between gap-2">
									<h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
										관련 구현 계획 문서
									</h2>
									<button
										type="button"
										onClick={() => setShowArchivedFiles((show) => !show)}
										aria-pressed={showArchivedFiles}
										aria-label="아카이브 문서 표시"
										className="rounded-md border border-[#d0d7de] p-1.5 text-zinc-500 dark:border-[#30363d] dark:text-zinc-400"
									>
										{showArchivedFiles ? (
											<Check className="h-3.5 w-3.5" />
										) : (
											<Archive className="h-3.5 w-3.5" />
										)}
									</button>
								</div>
								<div className="space-y-1">
									{visibleFiles.map((file) => (
										<button
											type="button"
											key={file.filename}
											onClick={() => handleSelectFile(file.filename)}
											className={`flex w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs font-semibold transition ${
												file.filename === activeFile.filename
													? "border-blue-500/30 bg-blue-500/10 text-blue-650 dark:text-blue-300"
													: "border-transparent text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
											}`}
										>
											<FileText className="h-3.5 w-3.5 shrink-0" />
											<span className="truncate" title={file.filename}>
												{file.filename}
											</span>
										</button>
									))}
								</div>
							</section>
						) : null}
						<PlanToc entries={activeFile.toc} />
					</aside>

					<article
						className={planDocumentClassName(
							"min-w-0 border-[#d0d7de] bg-white p-6 dark:border-[#30363d] dark:bg-[#161b22]",
						)}
					>
						{isEditing ? (
							<div className="flex flex-col gap-4">
								<div>
									<h2 className="text-sm font-bold text-zinc-900 dark:text-white">
										{activeFile.filename} 편집
									</h2>
									<p className="mt-1 text-xs text-zinc-500">
										Markdown 형식으로 편집합니다.
									</p>
								</div>
								<textarea
									value={editContent}
									onChange={(event) => setEditContent(event.target.value)}
									disabled={isSaving}
									className="workbench-scrollbar min-h-[520px] w-full rounded-lg border border-zinc-300 bg-white p-4 font-mono text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
								/>
								{error ? (
									<p
										role="alert"
										className="text-xs font-semibold text-red-600"
									>
										{error}
									</p>
								) : null}
								<div className="flex justify-end gap-2">
									<button
										type="button"
										onClick={() => setIsEditing(false)}
										disabled={isSaving}
										className="rounded-md border border-zinc-300 px-4 py-2 text-xs font-bold dark:border-zinc-700"
									>
										취소
									</button>
									<button
										type="button"
										onClick={() => void handleSave()}
										disabled={isSaving}
										className="rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
									>
										{isSaving ? "저장 중…" : "저장"}
									</button>
								</div>
							</div>
						) : (
							<PlanMarkdown
								html={activeFile.html}
								raw={activeFile.content}
								currentFile={activeFile.filename}
							/>
						)}
					</article>
				</div>
			</div>
		</AppShell>
	);
}
