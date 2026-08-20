import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	AlertCircle,
	Archive,
	Check,
	ChevronDown,
	ChevronRight,
	ChevronsDownUp,
	ChevronsUpDown,
	Code,
	Edit,
	FileText,
	Folder,
	GitBranch,
	ListFilter,
	Loader2,
	MessageSquareText,
	Play,
	Terminal,
} from "lucide-react";
import {
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
	useEffect,
	useState,
} from "react";
import { AppShell } from "#/components/layout/AppShell";
import { PlanMarkdown } from "#/components/plans/PlanMarkdown";
import { PlanToc } from "#/components/plans/PlanToc";
import {
	InlineNotice,
	type InlineNoticeTone,
} from "#/components/ui/InlineNotice";
import { Pill } from "#/components/ui/Pill";
import { surfaceClassName } from "#/components/ui/surfaceClassName";
import { getBrowserStorage } from "#/lib/browser-storage";
import {
	planDocumentClassName,
	planSidebarPanelClassName,
} from "#/lib/design-system-classnames";
import { getErrorMessage } from "#/lib/errors";
import {
	filterVisiblePlanFiles,
	getPlanFileTreeItemIds,
	planFileTreeItemId,
	reorderPlanFileTreeItemsByDrag,
} from "#/lib/plans/order";
import {
	clampPlanSidebarWidth,
	DEFAULT_PLAN_SIDEBAR_WIDTH,
	persistPlanSidebarWidth,
	readPlanSidebarWidth,
} from "#/lib/plans/sidebar-preferences";
import {
	type PlanTreeExpandMode,
	shouldExpandPlanFolder,
} from "#/lib/plans/tree-state";
import type { PlanDetail, PlanFile } from "#/lib/plans/types";
import {
	getPlan,
	getPlanSettings,
	savePlanFileFn,
	savePlanFileOrderFn,
} from "#/server/plans";
import { openAgentSession, openInTool } from "#/server/worktrees";

interface FileNode {
	name: string;
	title?: string;
	path?: string;
	fileIndex?: number;
	children?: { [key: string]: FileNode };
}

type PlanNotice = {
	tone: InlineNoticeTone;
	title: string;
	message?: string;
};

function buildFileTree(files: { filename: string; title: string }[]): FileNode {
	const root: FileNode = { name: "root", children: {} };

	files.forEach((file, index) => {
		const parts = file.filename.split("/");
		let current = root;

		parts.forEach((part, i) => {
			if (!current.children) {
				current.children = {};
			}

			const isLast = i === parts.length - 1;

			if (!current.children[part]) {
				current.children[part] = {
					name: part,
					children: isLast ? undefined : {},
				};
			}

			if (isLast) {
				current.children[part].path = file.filename;
				current.children[part].fileIndex = index;
				current.children[part].title = file.title;
			}

			current = current.children[part];
		});
	});

	return root;
}

interface FileTreeNodeProps {
	node: FileNode;
	activePath: string | undefined;
	onSelectFile: (path: string) => void;
	depth: number;
	pathPrefix: string;
	treeMode: PlanTreeExpandMode;
}

function FileTreeNode({
	node,
	activePath,
	onSelectFile,
	depth,
	pathPrefix,
	treeMode,
}: FileTreeNodeProps) {
	const isFolder = !!node.children;
	const nodePath =
		node.path ?? (pathPrefix ? `${pathPrefix}/${node.name}` : node.name);
	const [isExpanded, setIsExpanded] = useState(() =>
		isFolder
			? shouldExpandPlanFolder({
					folderPath: nodePath,
					activePath,
					treeMode,
				})
			: false,
	);

	useEffect(() => {
		if (!isFolder) return;
		const nextExpanded = shouldExpandPlanFolder({
			folderPath: nodePath,
			activePath,
			treeMode,
		});
		if (treeMode !== "auto" || nextExpanded) {
			setIsExpanded(nextExpanded);
		}
	}, [activePath, isFolder, nodePath, treeMode]);

	if (isFolder) {
		return (
			<SortablePlanFileTreeFolder
				node={node}
				nodePath={nodePath}
				isExpanded={isExpanded}
				setIsExpanded={setIsExpanded}
				activePath={activePath}
				onSelectFile={onSelectFile}
				depth={depth}
				treeMode={treeMode}
			/>
		);
	}

	const isActive = node.path === activePath;
	const displayName = node.title || node.name;
	if (!node.path) return null;
	return (
		<SortablePlanFileTreeLeaf
			nodePath={node.path}
			displayName={displayName}
			isActive={isActive}
			depth={depth}
			onSelectFile={onSelectFile}
		/>
	);
}

function SortablePlanFileTreeFolder({
	node,
	nodePath,
	isExpanded,
	setIsExpanded,
	activePath,
	onSelectFile,
	depth,
	treeMode,
}: {
	node: FileNode;
	nodePath: string;
	isExpanded: boolean;
	setIsExpanded: (isExpanded: boolean) => void;
	activePath: string | undefined;
	onSelectFile: (path: string) => void;
	depth: number;
	treeMode: PlanTreeExpandMode;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: planFileTreeItemId("folder", nodePath) });
	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.55 : 1,
	};

	return (
		<div className="flex flex-col select-none">
			<button
				type="button"
				ref={setNodeRef}
				onClick={() => setIsExpanded(!isExpanded)}
				aria-label={`${nodePath} ${isExpanded ? "접기" : "열기"}`}
				className="flex w-full items-center gap-1.5 py-1 px-1 text-left text-xs font-semibold dark:text-zinc-400 text-zinc-500 hover:dark:text-white hover:text-zinc-900 cursor-pointer rounded transition"
				style={{ ...style, paddingLeft: `${depth * 8 + 4}px` }}
				{...attributes}
				{...listeners}
			>
				{isExpanded ? (
					<ChevronDown className="h-3 w-3 shrink-0" />
				) : (
					<ChevronRight className="h-3 w-3 shrink-0" />
				)}
				<Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" />
				<span className="truncate" title={nodePath}>
					{node.name}
				</span>
			</button>

			{isExpanded && node.children && (
				<div className="flex flex-col mt-0.5 space-y-0.5">
					{Object.values(node.children).map((child) => (
						<FileTreeNode
							key={child.name}
							node={child}
							activePath={activePath}
							onSelectFile={onSelectFile}
							depth={depth + 1}
							pathPrefix={nodePath}
							treeMode={treeMode}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function SortablePlanFileTreeLeaf({
	nodePath,
	displayName,
	isActive,
	depth,
	onSelectFile,
}: {
	nodePath: string;
	displayName: string;
	isActive: boolean;
	depth: number;
	onSelectFile: (path: string) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: planFileTreeItemId("file", nodePath) });
	const style: CSSProperties = {
		paddingLeft: `${depth * 8 + 12}px`,
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.55 : 1,
	};

	return (
		<button
			type="button"
			ref={setNodeRef}
			onClick={() => onSelectFile(nodePath)}
			className={`w-full flex items-center gap-2 py-1 px-2.5 rounded-lg text-left text-xs font-semibold transition cursor-pointer select-none border ${
				isActive
					? "dark:bg-blue-500/10 bg-blue-500/5 dark:text-blue-400 text-blue-600 dark:border-blue-500/15 border-blue-500/10"
					: "border-transparent dark:text-zinc-400 text-zinc-500 hover:dark:bg-white/5 hover:bg-black/5 dark:hover:text-white hover:text-zinc-900"
			}`}
			style={style}
			{...attributes}
			{...listeners}
		>
			<FileText className="h-3.5 w-3.5 text-zinc-455 dark:text-zinc-400 shrink-0" />
			<span className="truncate" title={nodePath}>
				{displayName}
			</span>
		</button>
	);
}

interface PlanSearch {
	file?: string;
}

export const Route = createFileRoute("/plans/$taskId")({
	validateSearch: (search: Record<string, unknown>): PlanSearch => {
		return {
			file: typeof search.file === "string" ? search.file : undefined,
		};
	},
	loader: async ({ params }) => {
		const [plan, settings] = await Promise.all([
			getPlan({ data: { taskId: params.taskId } }),
			getPlanSettings(),
		]);
		return { plan, plansDir: settings.plansDir };
	},
	component: PlanDetailPage,
});

function PlanDetailPage() {
	const { plan, plansDir } = Route.useLoaderData();
	const { taskId } = Route.useParams();
	const { file: selectedFilename } = Route.useSearch();
	const cleanFilename = selectedFilename
		? selectedFilename.split("#")[0]
		: undefined;
	const navigate = useNavigate({ from: "/plans/$taskId" });
	const router = useRouter();

	// Editing states
	const [isEditing, setIsEditing] = useState(false);
	const [editContent, setEditContent] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [orderedFiles, setOrderedFiles] = useState<PlanFile[]>([]);
	const [isSavingFileOrder, setIsSavingFileOrder] = useState(false);
	const [fileOrderMessage, setFileOrderMessage] = useState<string | null>(null);
	const [fileTreeMode, setFileTreeMode] = useState<PlanTreeExpandMode>("auto");
	const [showArchivedFiles, setShowArchivedFiles] = useState(false);
	const [isFileFilterOpen, setIsFileFilterOpen] = useState(false);
	const [planSidebarWidth, setPlanSidebarWidth] = useState(
		DEFAULT_PLAN_SIDEBAR_WIDTH,
	);
	const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
	const [notice, setNotice] = useState<PlanNotice | null>(null);

	const isFileTreeExpandedAll = fileTreeMode === "expanded";
	const planFileOrderSensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	useEffect(() => {
		setPlanSidebarWidth(readPlanSidebarWidth(getBrowserStorage()));
	}, []);

	const handlePlanSidebarResizeStart = (
		event: ReactMouseEvent<HTMLButtonElement>,
	) => {
		event.preventDefault();

		const startX = event.clientX;
		const startWidth = planSidebarWidth;

		const handleMouseMove = (moveEvent: MouseEvent) => {
			const nextWidth = clampPlanSidebarWidth(
				startWidth + moveEvent.clientX - startX,
			);
			setPlanSidebarWidth(nextWidth);
			persistPlanSidebarWidth(getBrowserStorage(), nextWidth);
		};

		const handleMouseUp = () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		document.body.style.cursor = "ew-resize";
		document.body.style.userSelect = "none";
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	};

	const savePlanFile = useServerFn(savePlanFileFn);
	const savePlanFileOrder = useServerFn(savePlanFileOrderFn);
	const openAgent = useServerFn(openAgentSession);
	const currentFiles = plan
		? orderedFiles.length > 0
			? orderedFiles
			: plan.files
		: [];
	const visibleFiles = filterVisiblePlanFiles(currentFiles, showArchivedFiles);

	useEffect(() => {
		if (!plan) return;
		setOrderedFiles(plan.files);
		setFileOrderMessage(null);
	}, [plan]);

	// Exit edit mode if document changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: file selection changes should reset local editing state.
	useEffect(() => {
		setIsEditing(false);
		setError(null);
	}, [cleanFilename]);

	const handleOpenTool = async (
		wtPath: string,
		tool: "cursor" | "claude" | "codex" | "antigravity",
	) => {
		try {
			await openInTool({ data: { path: wtPath, tool } });
		} catch (err) {
			setNotice({
				tone: "error",
				title: "도구 실행 오류",
				message: getErrorMessage(err, "알 수 없는 오류"),
			});
		}
	};

	const handleOpenAgentSession = async (
		session: NonNullable<PlanDetail["agentSessions"]>[number],
	) => {
		setOpeningSessionId(session.sessionId);
		try {
			await openAgent({
				data: {
					agentType: session.agentType,
					sessionId: session.sessionId,
					cwd: session.cwd,
				},
			});
		} catch (err) {
			setNotice({
				tone: "error",
				title: "에이전트 실행 오류",
				message: getErrorMessage(err, "알 수 없는 오류"),
			});
		} finally {
			setOpeningSessionId(null);
		}
	};

	const handleCopyWorkPath = async (workPath: string) => {
		try {
			await navigator.clipboard.writeText(workPath);
			setNotice({
				tone: "success",
				title: "작업 경로 복사됨",
				message: workPath,
			});
		} catch (err) {
			setNotice({
				tone: "error",
				title: "작업 경로 복사 실패",
				message: getErrorMessage(err, "클립보드에 복사하지 못했습니다."),
			});
		}
	};

	const handleSelectFile = (filename: string) => {
		navigate({
			search: (prev) => ({ ...prev, file: filename }),
		});
	};

	const handleSaveContent = async () => {
		if (!plan || !editContent.trim()) return;
		const activeFileIndex = currentFiles.findIndex(
			(f) => f.filename === cleanFilename,
		);
		const safeIndex = activeFileIndex !== -1 ? activeFileIndex : 0;
		const activeFile = currentFiles[safeIndex];

		setIsSaving(true);
		setError(null);

		try {
			await savePlanFile({
				data: {
					taskId: plan.taskId,
					filename: activeFile.filename,
					content: editContent,
				},
			});

			setIsEditing(false);
			await router.invalidate();
		} catch (err) {
			console.error(err);
			setError(getErrorMessage(err, "파일 저장에 실패했습니다."));
		} finally {
			setIsSaving(false);
		}
	};

	const handlePlanFileDragEnd = async (event: DragEndEvent) => {
		if (!plan || !event.over) return;
		const activeFilename = String(event.active.id);
		const overFilename = String(event.over.id);
		if (activeFilename === overFilename) return;

		const previousFiles = currentFiles;
		const previousFilenames = previousFiles.map((file) => file.filename);
		const nextFilenames = reorderPlanFileTreeItemsByDrag(
			previousFilenames,
			activeFilename,
			overFilename,
		);
		if (nextFilenames === previousFilenames) return;

		const fileByName = new Map(
			previousFiles.map((file) => [file.filename, file]),
		);
		const nextFiles = nextFilenames
			.map((entry) => fileByName.get(entry))
			.filter((file): file is PlanFile => file !== undefined);

		setOrderedFiles(nextFiles);
		setIsSavingFileOrder(true);
		setFileOrderMessage("저장 중...");

		try {
			await savePlanFileOrder({
				data: {
					taskId: plan.taskId,
					filenames: nextFilenames,
				},
			});
			setFileOrderMessage("저장됨");
			await router.invalidate();
		} catch (err) {
			setOrderedFiles(previousFiles);
			setFileOrderMessage(getErrorMessage(err, "순서 저장에 실패했습니다."));
		} finally {
			setIsSavingFileOrder(false);
		}
	};

	if (!plan) {
		return (
			<AppShell variant="board">
				<div className="mx-auto max-w-3xl px-6 py-10">
					<Link
						to="/plans"
						className="text-sm font-semibold dark:text-blue-400 text-blue-600 dark:hover:text-blue-300 hover:text-blue-700 transition"
					>
						← 전체 구현 계획 목록
					</Link>

					<div className="mt-8 rounded-xl border border-red-500/20 p-6 flex items-start gap-4 dark:bg-red-500/5 bg-red-500/10 dark:text-zinc-300 text-zinc-700 backdrop-blur-md">
						<AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
						<div>
							<h3 className="text-sm font-bold dark:text-white text-zinc-800">
								구현 계획을 찾을 수 없습니다
							</h3>
							<p className="text-xs dark:text-zinc-400 text-zinc-500 mt-1">
								티켓 ID{" "}
								<code className="dark:text-red-300 text-red-600 font-bold">
									{taskId}
								</code>{" "}
								폴더가 <code>{plansDir}</code> 하위에 존재하지 않거나, 폴더 내에
								마크다운 문서(`.md`) 파일이 존재하지 않는 것 같습니다.
							</p>
						</div>
					</div>
				</div>
			</AppShell>
		);
	}

	const activeFileIndex = currentFiles.findIndex(
		(f) => f.filename === cleanFilename,
	);
	const safeIndex = activeFileIndex !== -1 ? activeFileIndex : 0;
	const activeFile = currentFiles[safeIndex];
	const activeFileDisplayTitle = activeFile.title || plan.title;

	const progress =
		activeFile.progressTotal > 0
			? `작업 ${activeFile.progressDone}/${activeFile.progressTotal}`
			: null;

	return (
		<AppShell variant="board">
			<div className="w-full mx-auto max-w-7xl px-6 py-10">
				<Link
					to="/plans"
					className="text-sm font-medium dark:text-zinc-200 text-zinc-600 dark:hover:text-white hover:text-zinc-900 hover:underline"
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
						<h1 className="text-2xl font-bold leading-snug dark:text-white text-zinc-800 font-sans">
							{activeFileDisplayTitle}
						</h1>
						{!isEditing && (
							<button
								type="button"
								onClick={() => {
									setEditContent(activeFile.content);
									setIsEditing(true);
									setError(null);
								}}
								className="flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-bold text-[#57606a] transition hover:border-[#54aeff]/45 hover:bg-[#ddf4ff]/45 hover:text-[#0969da] cursor-pointer select-none dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#c9d1d9] dark:hover:border-[#58a6ff]/45 dark:hover:bg-[#102a43]/55 dark:hover:text-[#79c0ff]"
							>
								<Edit className="h-3.5 w-3.5" />
								편집하기
							</button>
						)}
					</div>

					{plan.issueUrl ? (
						<a
							href={plan.issueUrl}
							target="_blank"
							rel="noreferrer"
							className="mt-2 inline-block text-sm font-medium dark:text-sky-400 text-sky-650 hover:underline"
						>
							이슈 열기
						</a>
					) : null}

					{currentFiles.length > 1 && (
						<details className="group mt-5 rounded-md border border-[#d0d7de] bg-white dark:border-[#30363d] dark:bg-[#161b22] lg:hidden">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold dark:text-zinc-200 text-zinc-800 select-none [&::-webkit-details-marker]:hidden">
								<span className="flex min-w-0 items-center gap-2">
									<FileText className="h-4 w-4 shrink-0 dark:text-zinc-400 text-zinc-500" />
									<span
										className="min-w-0 truncate"
										title={activeFile.filename}
									>
										{activeFileDisplayTitle}
									</span>
								</span>
								<ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
							</summary>
							<div className="grid gap-1 border-t border-[#d0d7de] p-1 dark:border-[#30363d]">
								{visibleFiles.map((file) => {
									const isActive = file.filename === activeFile.filename;
									return (
										<button
											type="button"
											key={file.filename}
											onClick={() => handleSelectFile(file.filename)}
											className={`flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-semibold transition cursor-pointer select-none ${
												isActive
													? "border-[#54aeff]/35 bg-[#ddf4ff] text-[#0969da] dark:border-[#58a6ff]/40 dark:bg-[#102a43] dark:text-[#79c0ff]"
													: "border-transparent text-[#57606a] hover:bg-[#f6f8fa] hover:text-[#24292f] dark:text-[#8b949e] dark:hover:bg-[#21262d] dark:hover:text-[#c9d1d9]"
											}`}
										>
											<FileText className="h-3.5 w-3.5 shrink-0 dark:text-zinc-500 text-zinc-400" />
											<span className="min-w-0 truncate" title={file.filename}>
												{file.filename}
											</span>
										</button>
									);
								})}
							</div>
						</details>
					)}
				</header>

				{notice ? (
					<div
						className="mt-5"
						role={notice.tone === "error" ? "alert" : "status"}
						aria-live={notice.tone === "error" ? "assertive" : "polite"}
					>
						<InlineNotice
							tone={notice.tone}
							title={notice.title}
							onDismiss={() => setNotice(null)}
						>
							{notice.message}
						</InlineNotice>
					</div>
				) : null}

				<div
					className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[var(--plan-layout-columns)]"
					style={
						{
							"--plan-layout-columns": `${planSidebarWidth}px minmax(0, 1fr)`,
						} as CSSProperties
					}
				>
					<aside
						data-plan-sidebar
						className="relative hidden lg:block space-y-6 shrink-0"
						style={{ width: `${planSidebarWidth}px` }}
					>
						<button
							type="button"
							onMouseDown={handlePlanSidebarResizeStart}
							className="absolute right-0 top-0 bottom-0 z-20 w-2 cursor-ew-resize rounded-full opacity-0 transition hover:bg-blue-400/25 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-400/35"
							aria-label="문서 사이드바 너비 조절"
							title="너비 조절"
						/>
						{currentFiles.length > 1 && (
							<div
								className={planSidebarPanelClassName(
									"min-w-0 border-[#d0d7de] bg-white p-3 pr-4 dark:border-[#30363d] dark:bg-[#161b22]",
								)}
							>
								<div className="mb-2.5 flex items-center justify-between gap-2 px-1">
									<span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wider dark:text-zinc-500 text-zinc-400 select-none">
										📂 관련 구현 계획 문서
									</span>
									<div className="flex shrink-0 items-center gap-1">
										<div className="relative">
											<button
												type="button"
												onClick={() => setIsFileFilterOpen((open) => !open)}
												className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition hover:dark:bg-white/10 hover:bg-black/10 hover:dark:text-zinc-100 hover:text-zinc-800 ${
													showArchivedFiles
														? "border-[#54aeff]/35 bg-[#ddf4ff] text-[#0969da] dark:border-[#58a6ff]/40 dark:bg-[#102a43] dark:text-[#79c0ff]"
														: "border-[#d0d7de] text-[#57606a] dark:border-[#30363d] dark:text-[#8b949e]"
												}`}
												aria-label="문서 필터"
												aria-expanded={isFileFilterOpen}
												aria-haspopup="menu"
												title="문서 필터"
											>
												<ListFilter className="h-3.5 w-3.5" />
											</button>
											{isFileFilterOpen ? (
												<div
													role="menu"
													className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border dark:border-white/10 border-black/10 dark:bg-zinc-900 bg-white p-1 shadow-xl"
												>
													<button
														type="button"
														role="menuitemcheckbox"
														aria-checked={showArchivedFiles}
														onClick={() =>
															setShowArchivedFiles((show) => !show)
														}
														className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-semibold dark:text-zinc-200 text-zinc-700 transition hover:dark:bg-white/10 hover:bg-black/5"
													>
														<Archive className="h-3.5 w-3.5 shrink-0" />
														<span className="min-w-0 flex-1 text-left">
															아카이브 보기
														</span>
														<Check
															className={`h-3.5 w-3.5 shrink-0 ${
																showArchivedFiles ? "opacity-100" : "opacity-0"
															}`}
														/>
													</button>
												</div>
											) : null}
										</div>
										<button
											type="button"
											onClick={() =>
												setFileTreeMode((mode) =>
													mode === "expanded" ? "collapsed" : "expanded",
												)
											}
											disabled={isSavingFileOrder}
											className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#d0d7de] text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#24292f] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#30363d] dark:text-[#8b949e] dark:hover:bg-[#21262d] dark:hover:text-[#c9d1d9]"
											aria-label={
												isFileTreeExpandedAll
													? "문서 전체 닫기"
													: "문서 전체 열기"
											}
											title={isFileTreeExpandedAll ? "전체 닫기" : "전체 열기"}
											aria-pressed={isFileTreeExpandedAll}
										>
											{isFileTreeExpandedAll ? (
												<ChevronsDownUp className="h-3.5 w-3.5" />
											) : (
												<ChevronsUpDown className="h-3.5 w-3.5" />
											)}
										</button>
									</div>
								</div>
								<DndContext
									id={`plan-file-order-${taskId}`}
									sensors={planFileOrderSensors}
									onDragEnd={handlePlanFileDragEnd}
								>
									<SortableContext
										items={getPlanFileTreeItemIds(
											visibleFiles.map((file) => file.filename),
										)}
										strategy={verticalListSortingStrategy}
									>
										<div className="flex flex-col gap-1 overflow-x-hidden">
											{Object.values(
												buildFileTree(visibleFiles).children || {},
											).map((node) => (
												<FileTreeNode
													key={node.name}
													node={node}
													activePath={activeFile.filename}
													onSelectFile={handleSelectFile}
													depth={0}
													pathPrefix=""
													treeMode={fileTreeMode}
												/>
											))}
										</div>
									</SortableContext>
								</DndContext>
								{fileOrderMessage ? (
									<p className="mt-2 px-1 text-[10px] font-semibold dark:text-zinc-400 text-zinc-500">
										{fileOrderMessage}
									</p>
								) : null}
							</div>
						)}

						<PlanWorkContextPanel
							plan={plan}
							openingSessionId={openingSessionId}
							onOpenTool={handleOpenTool}
							onOpenAgentSession={handleOpenAgentSession}
							onCopyPath={handleCopyWorkPath}
						/>

						<div data-plan-toc-sticky className="sticky top-16 z-10">
							<PlanToc entries={activeFile.toc} />
						</div>
					</aside>

					<div className="flex flex-col gap-6 min-w-0 flex-1">
						<article
							className={planDocumentClassName(
								"w-full min-w-0 border-[#d0d7de] bg-white p-6 dark:border-[#30363d] dark:bg-[#161b22]",
							)}
						>
							{isEditing ? (
								/* 편집 모드 */
								<div className="flex flex-col gap-4">
									<div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
										<span className="text-sm font-bold text-zinc-900 dark:text-white">
											📝 {activeFile.filename} 직접 편집 중
										</span>
										<span className="text-xs text-zinc-550">
											Markdown 형식으로 자유롭게 편집하세요.
										</span>
									</div>

									<textarea
										value={editContent}
										onChange={(e) => setEditContent(e.target.value)}
										className="w-full min-h-[450px] font-mono text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-4 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition workbench-scrollbar"
										disabled={isSaving}
									/>

									{/* Actions */}
									<div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
										<div>
											{error && (
												<span className="text-xs font-semibold text-red-650 dark:text-red-400 animate-fadeIn block max-w-md break-all">
													⚠️ {error}
												</span>
											)}
										</div>
										<div className="flex items-center gap-2">
											<button
												type="button"
												onClick={() => setIsEditing(false)}
												disabled={isSaving}
												className="px-4 py-2 text-xs font-bold rounded border border-zinc-350 dark:border-zinc-700 bg-white dark:bg-zinc-850 text-zinc-750 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-750 transition"
											>
												취소
											</button>
											<button
												type="button"
												onClick={handleSaveContent}
												disabled={isSaving || !editContent.trim()}
												className="px-4 py-2 text-xs font-bold rounded text-white transition shadow-md"
												style={{
													background: "var(--workbench-btn-primary)",
													color: "var(--workbench-btn-primary-text)",
												}}
											>
												{isSaving ? "저장 중…" : "저장하기"}
											</button>
										</div>
									</div>
								</div>
							) : (
								/* 뷰 모드 */
								<div>
									<PlanMarkdown
										html={activeFile.html}
										raw={activeFile.content}
										currentFile={activeFile.filename}
									/>
								</div>
							)}
						</article>
					</div>
				</div>
			</div>
		</AppShell>
	);
}

function PlanWorkContextPanel({
	plan,
	openingSessionId,
	onOpenTool,
	onOpenAgentSession,
	onCopyPath,
}: {
	plan: PlanDetail;
	openingSessionId: string | null;
	onOpenTool: (
		wtPath: string,
		tool: "cursor" | "claude" | "codex" | "antigravity",
	) => void;
	onOpenAgentSession: (
		session: NonNullable<PlanDetail["agentSessions"]>[number],
	) => void;
	onCopyPath: (workPath: string) => void;
}) {
	const branches = plan.branches ?? [];
	const sessions = (plan.agentSessions ?? []).slice(0, 5);
	const hasContext = branches.length > 0 || sessions.length > 0;

	return (
		<div
			className={planSidebarPanelClassName(
				"border-[#d0d7de] bg-white p-3.5 dark:border-[#30363d] dark:bg-[#161b22]",
			)}
		>
			<span className="text-[10px] font-bold uppercase tracking-wider dark:text-zinc-500 text-zinc-400 block mb-2.5 select-none px-1">
				작업 위치
			</span>
			{hasContext ? (
				<div className="space-y-3">
					{branches.map((branch) => (
						<div
							key={`${branch.repoName}:${branch.normalizedBranch}`}
							className={surfaceClassName(
								"flex flex-col gap-1.5 rounded-md border-[#d0d7de] bg-[#f6f8fa] p-2.5 text-xs shadow-none dark:border-[#30363d] dark:bg-[#0d1117]",
							)}
						>
							<div className="flex items-center gap-1.5 font-mono font-bold dark:text-zinc-200 text-zinc-700 min-w-0">
								<GitBranch className="h-3.5 w-3.5 text-blue-400 shrink-0" />
								<span className="truncate" title={branch.normalizedBranch}>
									{branch.normalizedBranch}
								</span>
							</div>
							<div className="flex flex-wrap gap-1.5">
								<PlanMiniBadge label={branch.repoName} />
								{branch.isLocal ? <PlanMiniBadge label="local" /> : null}
								{branch.isRemote ? <PlanMiniBadge label="remote" /> : null}
								<PlanMiniBadge
									label={branch.isCheckedOut ? "worktree" : "branch only"}
								/>
								{branch.reviewIds.map((id) => (
									<PlanMiniBadge key={id} label={`Review ${id}`} />
								))}
							</div>
							<button
								type="button"
								className="block w-full text-left text-[10px] dark:text-zinc-400 text-zinc-500 font-mono truncate cursor-pointer hover:underline"
								title={branch.worktreePath ?? branch.repoPath}
								onClick={() =>
									onCopyPath(branch.worktreePath ?? branch.repoPath)
								}
							>
								{branch.worktreePath ?? branch.repoPath}
							</button>
							{branch.worktreePath ? (
								<div className="flex items-center gap-1.5 mt-1.5">
									<button
										type="button"
										onClick={() =>
											onOpenTool(branch.worktreePath ?? "", "cursor")
										}
										className="flex items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2 py-1 text-[10px] font-bold text-[#57606a] transition hover:border-[#54aeff]/45 hover:bg-[#ddf4ff]/45 hover:text-[#0969da] cursor-pointer select-none dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#c9d1d9] dark:hover:border-[#58a6ff]/45 dark:hover:bg-[#102a43]/55 dark:hover:text-[#79c0ff]"
									>
										<Code className="h-3 w-3" />
										Cursor
									</button>
									<button
										type="button"
										onClick={() =>
											onOpenTool(branch.worktreePath ?? "", "antigravity")
										}
										className="flex items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2 py-1 text-[10px] font-bold text-[#57606a] transition hover:border-[#54aeff]/45 hover:bg-[#ddf4ff]/45 hover:text-[#0969da] cursor-pointer select-none dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#c9d1d9] dark:hover:border-[#58a6ff]/45 dark:hover:bg-[#102a43]/55 dark:hover:text-[#79c0ff]"
									>
										<Terminal className="h-3 w-3" />
										Terminal
									</button>
								</div>
							) : null}
						</div>
					))}

					{sessions.map((session) => {
						const opening = openingSessionId === session.sessionId;
						return (
							<div
								key={`${session.agentType}-${session.sessionId}`}
								className={surfaceClassName(
									"flex flex-col gap-1.5 rounded-md border-[#d0d7de] bg-[#f6f8fa] p-2.5 text-xs shadow-none dark:border-[#30363d] dark:bg-[#0d1117]",
								)}
							>
								<div className="flex items-center gap-1.5 font-bold dark:text-zinc-200 text-zinc-700 min-w-0">
									<MessageSquareText className="h-3.5 w-3.5 text-sky-400 shrink-0" />
									<span>{formatAgentType(session.agentType)}</span>
									<span
										className="truncate font-mono dark:text-zinc-400 text-zinc-500"
										title={session.sessionId}
									>
										{shortSessionId(session.sessionId)}
									</span>
								</div>
								{session.title ? (
									<div
										className="line-clamp-2 text-[11px] font-semibold dark:text-zinc-300 text-zinc-650"
										title={session.title}
									>
										{session.title}
									</div>
								) : null}
								{session.cwd ? (
									<div
										className="truncate font-mono text-[10px] dark:text-zinc-500 text-zinc-450"
										title={session.cwd}
									>
										{session.cwd}
									</div>
								) : null}
								<button
									type="button"
									onClick={() => onOpenAgentSession(session)}
									disabled={!session.canResume || opening}
									className="mt-1 flex w-fit items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2 py-1 text-[10px] font-bold text-[#57606a] transition hover:border-[#54aeff]/45 hover:bg-[#ddf4ff]/45 hover:text-[#0969da] cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#c9d1d9] dark:hover:border-[#58a6ff]/45 dark:hover:bg-[#102a43]/55 dark:hover:text-[#79c0ff]"
								>
									{opening ? (
										<Loader2 className="h-3 w-3 animate-spin" />
									) : (
										<Play className="h-3 w-3" />
									)}
									{session.canResume ? "이어 열기" : "기록만 표시"}
								</button>
							</div>
						);
					})}
				</div>
			) : (
				<p className="px-1 text-xs leading-relaxed dark:text-zinc-400 text-zinc-500">
					연결된 브랜치, 워크트리, 에이전트 세션이 없습니다.
				</p>
			)}
		</div>
	);
}

function PlanMiniBadge({ label }: { label: string }) {
	return (
		<Pill variant="status" tone="neutral" className="px-1.5 text-[10px]">
			{label}
		</Pill>
	);
}

function formatAgentType(value: string): string {
	if (value === "cursor") return "Cursor";
	if (value === "codex") return "Codex";
	if (value === "claude") return "Claude";
	return value;
}

function shortSessionId(value: string): string {
	if (value.length <= 13) return value;
	return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
