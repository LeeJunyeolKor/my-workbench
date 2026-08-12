import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Code,
	ExternalLink,
	Folder,
	GitBranch,
	Plus,
	RefreshCw,
	Settings,
	Sparkles,
	Terminal,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentWorkspacePanel } from "#/components/agent/AgentWorkspacePanel";
import { AppShell } from "#/components/layout/AppShell";
import {
	InlineNotice,
	type InlineNoticeTone,
} from "#/components/ui/InlineNotice";
import { ModalSurface } from "#/components/ui/ModalSurface";
import { Pill, type PillTone } from "#/components/ui/Pill";
import { surfaceClassName } from "#/components/ui/surfaceClassName";
import { getErrorMessage } from "#/lib/errors";
import { cancelAgentTask, type TaskViewState } from "#/lib/tauri-ipc";
import type {
	WorktreeConfig,
	WorktreeInfo,
	WorktreeType,
} from "#/lib/worktree";
import {
	selectInitialWorktreeRepoPath,
	summarizeWorktreeRepos,
} from "#/lib/worktree";
import {
	createWorktree,
	getBranches,
	getWorktrees,
	openInTool,
	removeWorktree,
	saveWorktreeConfig,
} from "#/server/worktrees";

export const Route = createFileRoute("/worktrees")({
	component: WorktreesPage,
});

type AgentTool = "claude" | "codex" | "antigravity";
type OpenTool = "cursor" | AgentTool;
type WorktreeNotice = {
	tone: InlineNoticeTone;
	title: string;
	message: string;
};

const AGENT_TOOL_TYPES = new Set<WorktreeType>([
	"claude",
	"codex",
	"antigravity",
]);

function isAgentTool(type: WorktreeType): type is AgentTool {
	return AGENT_TOOL_TYPES.has(type);
}

export function worktreeCardClassName(borderGlowClass = "") {
	return surfaceClassName(
		`group relative flex min-w-0 flex-col justify-between border-[#d0d7de] p-5 font-mono transition-all duration-200 hover:-translate-y-0.5 hover:border-[#54aeff]/45 hover:bg-[#ddf4ff]/35 dark:border-[#30363d] dark:hover:border-[#58a6ff]/45 dark:hover:bg-[#102a43]/45 ${borderGlowClass}`,
	);
}

function WorktreesPage() {
	const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
	const [config, setConfig] = useState<WorktreeConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pageNotice, setPageNotice] = useState<WorktreeNotice | null>(null);
	const [agentWorkspace, setAgentWorkspace] = useState<WorktreeInfo | null>(
		null,
	);
	const [agentTaskState, setAgentTaskState] = useState<TaskViewState | null>(
		null,
	);
	const [agentWorkspacePath, setAgentWorkspacePath] = useState<string | null>(
		null,
	);
	const agentCancellationRef = useRef<(() => Promise<void>) | null>(null);

	// UI 필터링 상태
	const [selectedRepo, setSelectedRepo] = useState<string>("all");
	const [selectedType, setSelectedType] = useState<string>("all");

	// 모달 상태
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

	// 워크트리 생성 폼 상태
	const [repos, setRepos] = useState<{ name: string; path: string }[]>([]);
	const [formRepoPath, setFormRepoPath] = useState("");
	const [formBranchName, setFormBranchName] = useState("");
	const [formIsNew, setFormIsNew] = useState(false);
	const [formBaseBranch, setFormBaseBranch] = useState("main");
	const [formCustomPath, setFormCustomPath] = useState("");
	const [branches, setBranches] = useState<string[]>([]);
	const [branchesLoading, setBranchesLoading] = useState(false);
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	// 설정 폼 상태
	const [settingsScanRoots, setSettingsScanRoots] = useState<string[]>([]);
	const [settingsNewRoot, setSettingsNewRoot] = useState("");
	const [settingsDefaultDir, setSettingsDefaultDir] = useState("");
	const [savingSettings, setSavingSettings] = useState(false);
	const [settingsError, setSettingsError] = useState<string | null>(null);
	const [removeTarget, setRemoveTarget] = useState<WorktreeInfo | null>(null);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const [removing, setRemoving] = useState(false);

	// 데이터 로드 함수
	const loadData = useCallback(async (silent = false, forceRefresh = false) => {
		if (!silent) setLoading(true);
		setError(null);
		try {
			const result = await getWorktrees({ data: { forceRefresh } });
			setWorktrees(result.worktrees);
			setConfig(result.config);

			// 스캔된 고유 레포지토리 목록 추출
			const uniqueRepos = summarizeWorktreeRepos(result.worktrees || []);
			setRepos(uniqueRepos);
			setFormRepoPath((current) =>
				selectInitialWorktreeRepoPath(current, uniqueRepos),
			);
		} catch (err) {
			console.error(err);
			setError(
				getErrorMessage(err, "데이터를 불러오는 중 오류가 발생했습니다."),
			);
		} finally {
			if (!silent) setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	// 특정 레포지토리 선택 시 브랜치 목록 로드
	useEffect(() => {
		if (!formRepoPath) return;

		const fetchBranches = async () => {
			setBranchesLoading(true);
			try {
				const result = await getBranches({ data: { repoPath: formRepoPath } });
				setBranches(result.branches);
				if (result.branches.length > 0) {
					setFormBranchName((prev) =>
						result.branches.includes(prev) ? prev : result.branches[0],
					);
				}
			} catch (err) {
				console.error(err);
			} finally {
				setBranchesLoading(false);
			}
		};
		fetchBranches();
	}, [formRepoPath]);

	// 설정 모달이 열릴 때 기존 설정 로드
	const handleOpenSettings = () => {
		if (config) {
			setSettingsScanRoots([...config.scanRoots]);
			setSettingsDefaultDir(config.defaultWorktreeDir);
		}
		setSettingsError(null);
		setIsSettingsModalOpen(true);
	};

	// 설정 저장
	const handleSaveSettings = async (e: React.FormEvent) => {
		e.preventDefault();
		setSavingSettings(true);
		setSettingsError(null);
		try {
			await saveWorktreeConfig({
				data: {
					scanRoots: settingsScanRoots,
					defaultWorktreeDir: settingsDefaultDir,
				},
			});
			setIsSettingsModalOpen(false);
			setPageNotice({
				tone: "success",
				title: "워크트리 설정을 저장했습니다",
				message: "스캔 경로와 기본 생성 경로를 다시 불러왔습니다.",
			});
			loadData();
		} catch (err) {
			setSettingsError(getErrorMessage(err, "설정 저장에 실패했습니다."));
		} finally {
			setSavingSettings(false);
		}
	};

	// 스캔 루트 추가
	const handleAddScanRoot = () => {
		if (!settingsNewRoot.trim()) return;
		if (settingsScanRoots.includes(settingsNewRoot.trim())) {
			setSettingsNewRoot("");
			return;
		}
		setSettingsScanRoots([...settingsScanRoots, settingsNewRoot.trim()]);
		setSettingsNewRoot("");
	};

	// 스캔 루트 제거
	const handleRemoveScanRoot = (index: number) => {
		setSettingsScanRoots(settingsScanRoots.filter((_, i) => i !== index));
	};

	// 워크트리 생성
	const handleCreateWorktree = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formRepoPath || !formBranchName.trim()) {
			setCreateError("저장소와 브랜치명을 선택해 주세요.");
			return;
		}

		setCreating(true);
		setCreateError(null);
		try {
			await createWorktree({
				data: {
					repoPath: formRepoPath,
					branchName: formBranchName.trim(),
					isNew: formIsNew,
					baseBranch: formIsNew ? formBaseBranch : undefined,
					customPath: formCustomPath.trim() || undefined,
				},
			});
			setIsCreateModalOpen(false);
			// 폼 초기화
			setFormBranchName("");
			setFormCustomPath("");
			setFormIsNew(false);
			setPageNotice({
				tone: "success",
				title: "워크트리를 생성했습니다",
				message: `${formBranchName.trim()} 브랜치를 기준으로 목록을 갱신합니다.`,
			});
			loadData();
		} catch (err) {
			setCreateError(
				getErrorMessage(
					err,
					"워크트리 생성 중 알 수 없는 오류가 발생했습니다.",
				),
			);
		} finally {
			setCreating(false);
		}
	};

	const handleAgentCancellationReady = useCallback(
		(cancel: (() => Promise<void>) | null) => {
			agentCancellationRef.current = cancel;
		},
		[],
	);
	const handleAgentWorkspacePathChange = useCallback((path: string) => {
		setAgentWorkspacePath(path);
	}, []);
	const clearAgentWorkspace = useCallback(() => {
		agentCancellationRef.current = null;
		setAgentWorkspace(null);
		setAgentWorkspacePath(null);
		setAgentTaskState(null);
	}, []);
	const handleCloseAgentWorkspace = useCallback(async () => {
		try {
			await agentCancellationRef.current?.();
			clearAgentWorkspace();
		} catch (err) {
			setPageNotice({
				tone: "error",
				title: "에이전트 작업을 종료하지 못했습니다",
				message: getErrorMessage(err, "실행 중인 작업을 취소하지 못했습니다."),
			});
		}
	}, [clearAgentWorkspace]);

	// 워크트리 삭제
	const handleRemoveWorktree = async (wt: WorktreeInfo) => {
		if (wt.type === "main") {
			setPageNotice({
				tone: "warning",
				title: "메인 저장소는 삭제할 수 없습니다",
				message: "Git worktree remove 대상은 보조 worktree로 제한됩니다.",
			});
			return;
		}

		setRemoveError(null);
		setRemoveTarget(wt);
	};

	const handleConfirmRemoveWorktree = async () => {
		if (!removeTarget) return;

		const isAgent = isAgentTool(removeTarget.type);
		const activeWorkspacePath =
			agentWorkspacePath ?? agentWorkspace?.path ?? null;
		const closesAgentWorkspace = activeWorkspacePath === removeTarget.path;
		const activeAgentTaskId =
			closesAgentWorkspace &&
			(agentTaskState?.status === "Preparing" ||
				agentTaskState?.status === "Running")
				? agentTaskState.taskId
				: null;
		setRemoving(true);
		setRemoveError(null);
		try {
			if (closesAgentWorkspace) {
				if (agentCancellationRef.current) {
					await agentCancellationRef.current();
				} else if (activeAgentTaskId) {
					await cancelAgentTask(activeAgentTaskId);
				}
			}
			await removeWorktree({
				data: { path: removeTarget.path, force: isAgent },
			});
			if (closesAgentWorkspace) {
				// Cancellation completes before the selected worktree is removed.
				clearAgentWorkspace();
			}
			setPageNotice({
				tone: "success",
				title: "워크트리를 삭제했습니다",
				message: removeTarget.path,
			});
			setRemoveTarget(null);
			loadData(true);
		} catch (err) {
			setRemoveError(
				getErrorMessage(
					err,
					"워크트리 삭제 중 알 수 없는 오류가 발생했습니다.",
				),
			);
		} finally {
			setRemoving(false);
		}
	};

	// 도구 실행
	const handleOpenTool = async (wtPath: string, tool: OpenTool) => {
		try {
			await openInTool({ data: { path: wtPath, tool } });
		} catch (err) {
			setPageNotice({
				tone: "error",
				title: "도구를 실행하지 못했습니다",
				message: getErrorMessage(err, "알 수 없는 오류가 발생했습니다."),
			});
		}
	};

	// 필터링 적용된 워크트리 목록
	const filteredWorktrees = worktrees
		.filter((wt) => wt?.repoPath)
		.filter((wt) => {
			const matchRepo = selectedRepo === "all" || wt.repoPath === selectedRepo;
			const matchType = selectedType === "all" || wt.type === selectedType;
			return matchRepo && matchType;
		});

	// 고유 프로젝트 목록 (필터 탭용)
	const filterRepos = summarizeWorktreeRepos(worktrees);

	const getTypeBadgeTone = (type: WorktreeType): PillTone => {
		switch (type) {
			case "main":
				return "blue";
			case "claude":
				return "amber";
			case "codex":
				return "green";
			case "antigravity":
				return "violet";
			default:
				return "neutral";
		}
	};

	const getTypeLabel = (type: WorktreeType) => {
		switch (type) {
			case "main":
				return "Main Repo";
			case "developer":
				return "Developer";
			case "claude":
				return "Claude Agent";
			case "codex":
				return "Codex Agent";
			case "antigravity":
				return "Antigravity Agent";
			default:
				return type;
		}
	};

	return (
		<AppShell variant="board">
			<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
				{/* 상단 헤더 영역 */}
				<div className="flex flex-col gap-4 border-b border-[#d0d7de] pb-6 sm:flex-row sm:items-center sm:justify-between dark:border-[#30363d]">
					<div>
						<h1 className="text-2xl font-bold tracking-tight dark:text-white text-zinc-900">
							Git Worktrees
						</h1>
						<p className="text-sm mt-1 dark:text-zinc-200 text-zinc-650">
							설정한 작업공간의 Git 워크트리를 스캔하고 통합 관리합니다.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => loadData(false, true)}
							className="flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-semibold text-[#57606a] shadow-sm transition hover:border-[#54aeff]/45 hover:bg-[#ddf4ff]/45 hover:text-[#0969da] active:scale-95 cursor-pointer dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#c9d1d9] dark:hover:border-[#58a6ff]/45 dark:hover:bg-[#102a43]/55 dark:hover:text-[#79c0ff]"
						>
							<RefreshCw
								className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
							/>
							새로고침
						</button>
						<button
							type="button"
							onClick={handleOpenSettings}
							className="flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 text-xs font-semibold text-[#57606a] shadow-sm transition hover:border-[#54aeff]/45 hover:bg-[#ddf4ff]/45 hover:text-[#0969da] active:scale-95 cursor-pointer dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#c9d1d9] dark:hover:border-[#58a6ff]/45 dark:hover:bg-[#102a43]/55 dark:hover:text-[#79c0ff]"
						>
							<Settings className="h-3.5 w-3.5" />
							설정
						</button>
						<button
							type="button"
							onClick={() => {
								setCreateError(null);
								setIsCreateModalOpen(true);
							}}
							className="flex items-center gap-1.5 rounded-md border border-[#54aeff]/35 bg-[#0969da] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0757b8] active:scale-95 cursor-pointer dark:border-[#58a6ff]/40 dark:bg-[#1f6feb] dark:hover:bg-[#388bfd]"
						>
							<Plus className="h-3.5 w-3.5" />
							워크트리 생성
						</button>
					</div>
				</div>

				{/* 에러 표시 */}
				{error && (
					<InlineNotice
						tone="error"
						title="워크트리 목록을 불러오지 못했습니다"
						className="mt-6"
					>
						{error}
					</InlineNotice>
				)}

				{pageNotice && (
					<InlineNotice
						tone={pageNotice.tone}
						title={pageNotice.title}
						className="mt-6"
						onDismiss={() => setPageNotice(null)}
					>
						<span className="break-all">{pageNotice.message}</span>
					</InlineNotice>
				)}

				{agentWorkspace && (
					<div className="mt-6">
						<AgentWorkspacePanel
							compact
							initialWorkspacePath={agentWorkspace.path}
							initialWorkspaceName={`${agentWorkspace.repoName} · ${agentWorkspace.branch}`}
							executionMode="existing-worktree"
							onClose={handleCloseAgentWorkspace}
							onTaskStateChange={setAgentTaskState}
							onTaskCancellationReady={handleAgentCancellationReady}
							onWorkspacePathChange={handleAgentWorkspacePathChange}
						/>
					</div>
				)}

				{/* 필터 영역 */}
				{!loading && worktrees.length > 0 && (
					<div className="mt-6 flex flex-wrap items-center justify-between gap-4">
						{/* 레포지토리 필터 칩 */}
						<div className="flex flex-wrap gap-1.5">
							<button
								type="button"
								onClick={() => setSelectedRepo("all")}
								className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
									selectedRepo === "all"
										? "border-[#54aeff]/35 bg-[#ddf4ff] text-[#0969da] dark:border-[#58a6ff]/40 dark:bg-[#102a43] dark:text-[#79c0ff]"
										: "border-transparent text-[#57606a] hover:border-[#d0d7de] hover:bg-[#f6f8fa] hover:text-[#24292f] dark:text-[#8b949e] dark:hover:border-[#30363d] dark:hover:bg-[#21262d] dark:hover:text-[#c9d1d9]"
								}`}
							>
								전체 프로젝트 ({worktrees.length})
							</button>
							{filterRepos.map((repo) => {
								return (
									<button
										type="button"
										key={repo.path}
										onClick={() => setSelectedRepo(repo.path)}
										className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
											selectedRepo === repo.path
												? "border-[#54aeff]/35 bg-[#ddf4ff] text-[#0969da] dark:border-[#58a6ff]/40 dark:bg-[#102a43] dark:text-[#79c0ff]"
												: "border-transparent text-[#57606a] hover:border-[#d0d7de] hover:bg-[#f6f8fa] hover:text-[#24292f] dark:text-[#8b949e] dark:hover:border-[#30363d] dark:hover:bg-[#21262d] dark:hover:text-[#c9d1d9]"
										}`}
									>
										{repo.name} ({repo.count})
									</button>
								);
							})}
						</div>

						{/* 유형 필터 셀렉트 */}
						<div className="flex items-center gap-2">
							<span className="text-xs dark:text-zinc-200 text-zinc-700">
								유형 필터:
							</span>
							<select
								value={selectedType}
								onChange={(e) => setSelectedType(e.target.value)}
								className="rounded-md border border-[#d0d7de] bg-white px-2.5 py-1 text-xs text-[#24292f] outline-none transition hover:bg-[#f6f8fa] cursor-pointer dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#c9d1d9] dark:hover:bg-[#21262d]"
							>
								<option value="all">전체 유형</option>
								<option value="main">Main Repositories</option>
								<option value="developer">Developer (수동)</option>
								<option value="claude">Claude Agents</option>
								<option value="codex">Codex Agents</option>
								<option value="antigravity">Antigravity Agents</option>
							</select>
						</div>
					</div>
				)}

				{/* 메인 콘텐츠 목록 */}
				<div className="mt-6">
					{loading ? (
						// 스켈레톤 로딩
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{[1, 2, 3, 4, 5, 6].map((i) => (
								<div
									key={i}
									className="animate-pulse rounded-xl border dark:border-white/5 border-black/5 p-5 space-y-4 dark:bg-black/20 bg-white/40"
								>
									<div className="flex justify-between items-start">
										<div className="h-5 w-24 dark:bg-white/15 bg-black/10 rounded" />
										<div className="h-4 w-16 dark:bg-white/15 bg-black/10 rounded" />
									</div>
									<div className="space-y-2">
										<div className="h-4 w-full dark:bg-white/15 bg-black/10 rounded" />
										<div className="h-3 w-2/3 dark:bg-white/15 bg-black/10 rounded" />
									</div>
									<div className="h-8 dark:bg-white/15 bg-black/10 rounded" />
								</div>
							))}
						</div>
					) : filteredWorktrees.length === 0 ? (
						// 빈 화면
						<div className="flex items-start gap-4 rounded-md border border-[#d0d7de] bg-white p-6 text-zinc-700 shadow-[var(--workbench-panel-shadow)] backdrop-blur-xl dark:border-[#30363d] dark:bg-[#161b22] dark:text-zinc-300">
							<Folder className="w-5 h-5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
							<div>
								<h3 className="text-sm font-bold dark:text-white text-zinc-900">
									검색된 워크트리가 없습니다
								</h3>
								<p className="text-xs dark:text-zinc-400 text-zinc-600 mt-1 leading-normal font-sans">
									지정된 경로 하위에 검색 조건과 일치하는 Git 작업
									폴더(Worktree)가 존재하지 않습니다.
									<br />
									설정에서 프로젝트 스캔 경로를 확인하거나 새로운 워크트리를
									등록해 보세요.
								</p>
							</div>
						</div>
					) : (
						// 워크트리 카드 그리드
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{filteredWorktrees.map((wt) => {
								const isMain = wt.type === "main";
								const agentTool = isAgentTool(wt.type) ? wt.type : null;

								// 에이전트 타입별 테두리 및 글로우 계산
								let borderGlowClass = "";
								let glowStyle: React.CSSProperties = {};

								if (wt.type === "main") {
									borderGlowClass =
										"dark:border-blue-500/40 border-blue-500/30";
									glowStyle = {
										boxShadow:
											"var(--workbench-panel-shadow), 0 0 15px rgba(59, 130, 246, 0.2)",
									};
								} else if (wt.type === "claude") {
									borderGlowClass =
										"dark:border-amber-500/30 border-amber-500/20";
									glowStyle = {
										boxShadow:
											"var(--workbench-panel-shadow), 0 0 15px rgba(245, 158, 11, 0.15)",
									};
								} else if (wt.type === "codex") {
									borderGlowClass =
										"dark:border-emerald-500/30 border-emerald-500/20";
									glowStyle = {
										boxShadow:
											"var(--workbench-panel-shadow), 0 0 15px rgba(16, 185, 129, 0.15)",
									};
								} else if (wt.type === "antigravity") {
									borderGlowClass =
										"dark:border-purple-500/35 border-purple-500/25";
									glowStyle = {
										boxShadow:
											"var(--workbench-panel-shadow), 0 0 15px rgba(168, 85, 247, 0.15)",
									};
								}

								return (
									<div
										key={wt.path}
										className={worktreeCardClassName(borderGlowClass)}
										style={glowStyle}
									>
										{/* 카드 헤더 */}
										<div>
											<div className="flex items-start justify-between gap-2">
												<div className="flex flex-col min-w-0">
													<Pill
														variant="status"
														tone={getTypeBadgeTone(wt.type)}
														className="mb-1.5 self-start gap-1 text-[10px] font-bold uppercase tracking-wider"
													>
														{getTypeLabel(wt.type)}
													</Pill>
													<h3
														className="text-base font-semibold truncate flex items-center gap-1.5 dark:text-white text-zinc-900"
														title={wt.branch}
													>
														<GitBranch className="h-4 w-4 shrink-0 text-zinc-450" />
														{wt.branch}
													</h3>
												</div>

												{/* Dirty / Clean 표시기 */}
												{!isMain && (
													<Pill
														variant="status"
														tone={wt.isDirty ? "amber" : "green"}
														className="shrink-0 gap-1 text-[10px] font-medium"
													>
														<span
															className={`h-1.5 w-1.5 rounded-full ${wt.isDirty ? "bg-amber-500" : "bg-emerald-500"}`}
														/>
														{wt.isDirty ? `${wt.dirtyCount} files` : "Clean"}
													</Pill>
												)}
											</div>

											{/* 정보 본문 */}
											<div className="mt-3 space-y-2 text-xs">
												<div className="flex items-center gap-1">
													<span className="font-semibold text-zinc-500">
														Project:
													</span>
													<span className="dark:text-zinc-200 text-zinc-800 font-medium">
														{wt.repoName}
													</span>
												</div>
												<div className="flex items-center gap-1 min-w-0">
													<span className="font-semibold text-zinc-500 shrink-0">
														Path:
													</span>
													<span
														className="min-w-0 truncate font-mono dark:text-zinc-400 text-zinc-550"
														title={wt.path}
													>
														{wt.path}
													</span>
												</div>
												<div className="mt-2 flex flex-col gap-0.5 border-t border-[#d0d7de] pt-2 dark:border-[#30363d]">
													<span className="text-[10px] text-zinc-500 uppercase font-semibold">
														Latest Commit
													</span>
													<p
														className="dark:text-zinc-300 text-zinc-700 truncate italic"
														title={wt.commitMessage}
													>
														"{wt.commitMessage}"
													</p>
												</div>

												{/* 작업 키 매핑 표시 */}
												{wt.issueKey && (
													<div className="flex flex-col gap-0.5 border-t border-[#d0d7de] pt-2 dark:border-[#30363d]">
														<span className="text-[10px] text-zinc-500 uppercase font-semibold">
															Task Key
														</span>
														<div className="flex items-center gap-1">
															<span className="font-semibold text-blue-500 dark:text-blue-400">
																{wt.issueKey}
															</span>
															{wt.issueTitle && (
																<span
																	className="dark:text-zinc-400 text-zinc-500 truncate text-[11px]"
																	title={wt.issueTitle}
																>
																	— {wt.issueTitle}
																</span>
															)}
														</div>
													</div>
												)}

												{/* AI Plan 연동 정보 표시 */}
												{wt.associatedPlan && (
													<div className="flex flex-col gap-1 border-t border-[#d0d7de] pt-2 dark:border-[#30363d]">
														<div className="flex items-center justify-between">
															<span className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-semibold uppercase">
																<Sparkles className="h-3 w-3" />
																AI Plan {wt.associatedPlan.progress}%
															</span>
															<Link
																to="/plans/$taskId"
																params={{
																	taskId: wt.associatedPlan.taskId,
																}}
																className="text-[10px] dark:text-zinc-400 text-zinc-550 dark:hover:text-zinc-350 hover:text-zinc-800 flex items-center gap-0.5 underline transition"
															>
																Plan 보기
																<ExternalLink className="h-2.5 w-2.5" />
															</Link>
														</div>

														{/* 프로그레스 바 */}
														<div className="h-1.5 w-full bg-black/10 dark:bg-black/40 rounded-full overflow-hidden border dark:border-white/5 border-black/5">
															<div
																className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
																style={{
																	width: `${wt.associatedPlan.progress}%`,
																}}
															/>
														</div>
														<div className="flex items-center justify-between text-[9px] text-zinc-550">
															<span>진행율</span>
															<span>
																{wt.associatedPlan.completed} /{" "}
																{wt.associatedPlan.total} 태스크 완료
															</span>
														</div>
													</div>
												)}
											</div>
										</div>

										{/* 액션 버튼 */}
										<div className="mt-5 flex items-center justify-end gap-1.5 border-t border-[#d0d7de] pt-3 dark:border-[#30363d]">
											{/* 삭제 버튼 */}
											{!isMain && (
												<button
													type="button"
													onClick={() => handleRemoveWorktree(wt)}
													className="mr-auto rounded-md border border-[#ff8182]/35 bg-[#ffebe9] p-1.5 text-[#cf222e] transition hover:bg-red-100 active:scale-95 cursor-pointer dark:border-[#f85149]/45 dark:bg-[#3d1719] dark:text-[#ff7b72] dark:hover:bg-[#4d1f21]"
													title="워크트리 삭제"
													aria-label={`${wt.branch} 워크트리 삭제`}
												>
													<Trash2 className="h-3.5 w-3.5" />
												</button>
											)}

											{/* 특화 에이전트 CLI 실행 버튼 */}
											{agentTool && (
												<button
													type="button"
													onClick={() => handleOpenTool(wt.path, agentTool)}
													className="flex items-center gap-1 rounded-md border border-[#d0d7de] bg-white px-2 py-1 text-[10px] font-semibold text-[#57606a] transition hover:bg-[#f6f8fa] active:scale-95 cursor-pointer dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#c9d1d9] dark:hover:bg-[#21262d]"
												>
													<Terminal className="h-3 w-3" />
													Run{" "}
													{wt.type === "claude"
														? "Claude"
														: wt.type === "codex"
															? "Codex"
															: "Antigravity"}
												</button>
											)}

											{/* Agent workspace handoff */}
											<button
												type="button"
												onClick={() => {
													setAgentTaskState(null);
													setAgentWorkspacePath(wt.path);
													setAgentWorkspace(wt);
												}}
												className="flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 transition hover:bg-violet-100 active:scale-95 cursor-pointer dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
												title="이 워크트리를 Agent 작업대에서 열기"
											>
												<Sparkles className="h-3 w-3" />
												Agent 작업대
											</button>

											{/* Cursor 실행 (프라이머리) */}
											<button
												type="button"
												onClick={() => handleOpenTool(wt.path, "cursor")}
												className="flex items-center gap-1.5 rounded-md border border-[#54aeff]/35 bg-[#ddf4ff] px-3 py-1.5 text-xs font-semibold text-[#0969da] shadow-[0_0_10px_rgba(84,174,255,0.12)] transition hover:bg-[#b6e3ff] active:scale-95 cursor-pointer dark:border-[#58a6ff]/40 dark:bg-[#102a43] dark:text-[#79c0ff] dark:hover:bg-[#16395c]"
											>
												<Code className="h-3.5 w-3.5" />
												Cursor
											</button>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* ========================================================================= */}
				{/* 워크트리 생성 모달 */}
				{isCreateModalOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
						<div
							className="w-full max-w-md rounded-2xl border dark:border-white/10 border-black/5 p-6 shadow-2xl relative dark:bg-[#1c2024]/95 bg-white/95 backdrop-blur-md dark:text-white text-zinc-900"
							role="dialog"
							aria-modal="true"
						>
							<button
								type="button"
								onClick={() => setIsCreateModalOpen(false)}
								className="absolute right-4 top-4 dark:text-white/40 text-zinc-400 dark:hover:text-white hover:text-zinc-950 transition"
								aria-label="워크트리 생성 모달 닫기"
							>
								<X className="h-5 w-5" aria-hidden="true" />
							</button>

							<h2 className="text-lg font-bold flex items-center gap-2">
								<Plus className="h-5 w-5 text-[var(--workbench-accent-blue)]" />
								새 Git 워크트리 생성
							</h2>
							<p className="text-xs mt-1 dark:text-zinc-300 text-zinc-650">
								기존 브랜치 또는 신규 브랜치 용도로 워크트리를 추가합니다.
							</p>

							<form onSubmit={handleCreateWorktree} className="mt-5 space-y-4">
								{createError && (
									<InlineNotice tone="error" title="워크트리 생성 실패">
										{createError}
									</InlineNotice>
								)}

								{/* 1. 대상 레포지토리 선택 */}
								<div className="space-y-1.5">
									<label
										htmlFor="worktree-repo-path"
										className="text-xs font-semibold dark:text-zinc-300 text-zinc-700"
									>
										대상 Git 저장소
									</label>
									<select
										id="worktree-repo-path"
										value={formRepoPath}
										onChange={(e) => setFormRepoPath(e.target.value)}
										className="w-full rounded-lg border dark:border-white/10 border-black/10 px-3 py-2 text-sm outline-none dark:bg-black/30 bg-white dark:text-white text-zinc-850 cursor-pointer focus:border-[var(--workbench-accent-blue)]/50 focus:ring-1 focus:ring-[var(--workbench-accent-blue)]/50 transition"
										required
									>
										{repos.map((repo) => (
											<option
												key={repo.path}
												value={repo.path}
												className="dark:bg-[#1c2024] bg-white"
											>
												{repo.name} ({repo.path})
											</option>
										))}
									</select>
								</div>

								{/* 2. 브랜치 타입 선택 */}
								<div className="flex gap-4 pt-1">
									<label className="flex items-center gap-2 text-xs font-medium cursor-pointer dark:text-zinc-300 text-zinc-700">
										<input
											type="radio"
											checked={!formIsNew}
											onChange={() => setFormIsNew(false)}
											className="cursor-pointer accent-[var(--workbench-accent-blue)]"
										/>
										기존 브랜치 가져오기
									</label>
									<label className="flex items-center gap-2 text-xs font-medium cursor-pointer dark:text-zinc-300 text-zinc-700">
										<input
											type="radio"
											checked={formIsNew}
											onChange={() => setFormIsNew(true)}
											className="cursor-pointer accent-[var(--workbench-accent-blue)]"
										/>
										새 브랜치 만들기
									</label>
								</div>

								{/* 3. 브랜치명 입력/선택 */}
								<div className="space-y-1.5">
									<label
										htmlFor="worktree-branch-name"
										className="text-xs font-semibold dark:text-zinc-300 text-zinc-700"
									>
										브랜치 이름
									</label>
									{formIsNew ? (
										<input
											id="worktree-branch-name"
											type="text"
											placeholder="예: feature/DEMO-101-nextjs"
											value={formBranchName}
											onChange={(e) => setFormBranchName(e.target.value)}
											className="w-full rounded-lg border dark:border-white/10 border-black/10 px-3 py-2 text-sm outline-none dark:bg-black/30 bg-white dark:text-white text-zinc-850 focus:border-[var(--workbench-accent-blue)]/50 focus:ring-1 focus:ring-[var(--workbench-accent-blue)]/50 transition"
											required
										/>
									) : (
										<div className="relative">
											<select
												id="worktree-branch-name"
												value={formBranchName}
												onChange={(e) => setFormBranchName(e.target.value)}
												className="w-full rounded-lg border dark:border-white/10 border-black/10 px-3 py-2 text-sm outline-none dark:bg-black/30 bg-white dark:text-white text-zinc-850 cursor-pointer disabled:opacity-50 focus:border-[var(--workbench-accent-blue)]/50 focus:ring-1 focus:ring-[var(--workbench-accent-blue)]/50 transition"
												disabled={branchesLoading || branches.length === 0}
												required
											>
												{branchesLoading ? (
													<option className="dark:bg-[#1c2024] bg-white">
														브랜치 로드 중...
													</option>
												) : branches.length === 0 ? (
													<option className="dark:bg-[#1c2024] bg-white">
														브랜치가 없습니다.
													</option>
												) : (
													branches.map((b) => (
														<option
															key={b}
															value={b}
															className="dark:bg-[#1c2024] bg-white"
														>
															{b}
														</option>
													))
												)}
											</select>
										</div>
									)}
								</div>

								{/* 3.5. 새 브랜치일 때 Base Branch 지정 */}
								{formIsNew && (
									<div className="space-y-1.5">
										<label
											htmlFor="worktree-base-branch"
											className="text-xs font-semibold dark:text-zinc-300 text-zinc-700"
										>
											기반 브랜치 (Base branch)
										</label>
										<select
											id="worktree-base-branch"
											value={formBaseBranch}
											onChange={(e) => setFormBaseBranch(e.target.value)}
											className="w-full rounded-lg border dark:border-white/10 border-black/10 px-3 py-2 text-sm outline-none dark:bg-black/30 bg-white dark:text-white text-zinc-850 cursor-pointer focus:border-[var(--workbench-accent-blue)]/50 focus:ring-1 focus:ring-[var(--workbench-accent-blue)]/50 transition"
										>
											<option
												value="main"
												className="dark:bg-[#1c2024] bg-white"
											>
												main
											</option>
											<option
												value="master"
												className="dark:bg-[#1c2024] bg-white"
											>
												master
											</option>
											{branches
												.filter((b) => b !== "main" && b !== "master")
												.map((b) => (
													<option
														key={b}
														value={b}
														className="dark:bg-[#1c2024] bg-white"
													>
														{b}
													</option>
												))}
										</select>
									</div>
								)}

								{/* 4. 커스텀 경로 (선택 사항) */}
								<div className="space-y-1.5">
									<label
										htmlFor="worktree-custom-path"
										className="text-xs font-semibold dark:text-zinc-300 text-zinc-700"
									>
										저장 경로{" "}
										<span className="dark:text-zinc-400 text-zinc-550 font-normal">
											(생략 시 기본 경로에 생성)
										</span>
									</label>
									<input
										id="worktree-custom-path"
										type="text"
										placeholder="예: ~/.my-workbench/worktrees/my-wt"
										value={formCustomPath}
										onChange={(e) => setFormCustomPath(e.target.value)}
										className="w-full rounded-lg border dark:border-white/10 border-black/10 px-3 py-2 text-sm outline-none dark:bg-black/30 bg-white dark:text-white text-zinc-850 focus:border-[var(--workbench-accent-blue)]/50 focus:ring-1 focus:ring-[var(--workbench-accent-blue)]/50 transition"
									/>
									<p className="text-[10px] dark:text-zinc-400 text-zinc-500">
										기본값:{" "}
										{config?.defaultWorktreeDir || "~/.my-workbench/worktrees"}
										/[저장소명]-wt-[브랜치명]
									</p>
								</div>

								{/* 5. 제출 및 제어 */}
								<div className="flex gap-2 pt-2 justify-end">
									<button
										type="button"
										onClick={() => setIsCreateModalOpen(false)}
										className="rounded-lg border dark:border-white/10 border-black/10 px-4 py-2 text-xs font-semibold dark:text-zinc-300 text-zinc-650 dark:hover:bg-white/5 hover:bg-black/5 active:scale-95 transition cursor-pointer"
									>
										취소
									</button>
									<button
										type="submit"
										disabled={creating}
										className="rounded-lg bg-[var(--workbench-accent-blue)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 active:scale-95 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
									>
										{creating && <RefreshCw className="h-3 w-3 animate-spin" />}
										워크트리 생성
									</button>
								</div>
							</form>
						</div>
					</div>
				)}

				{/* ========================================================================= */}
				{/* 설정 관리 모달 */}
				{isSettingsModalOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
						<div
							className="w-full max-w-lg rounded-2xl border dark:border-white/10 border-black/5 p-6 shadow-2xl relative dark:bg-[#1c2024]/95 bg-white/95 backdrop-blur-md dark:text-white text-zinc-900"
							role="dialog"
							aria-modal="true"
						>
							<button
								type="button"
								onClick={() => setIsSettingsModalOpen(false)}
								className="absolute right-4 top-4 dark:text-white/40 text-zinc-450 dark:hover:text-white hover:text-zinc-950 transition"
								aria-label="워크트리 설정 모달 닫기"
							>
								<X className="h-5 w-5" aria-hidden="true" />
							</button>

							<h2 className="text-lg font-bold flex items-center gap-2">
								<Settings className="h-5 w-5 dark:text-zinc-400 text-zinc-600" />
								워크트리 매니저 설정
							</h2>
							<p className="text-xs mt-1 dark:text-zinc-300 text-zinc-650">
								Git 저장소를 스캔할 프로젝트 경로 및 새 워크트리가 생성될
								디렉토리를 정의합니다.
							</p>

							<form onSubmit={handleSaveSettings} className="mt-5 space-y-5">
								{settingsError && (
									<InlineNotice tone="error" title="설정 저장 실패">
										{settingsError}
									</InlineNotice>
								)}

								{/* 1. 스캔할 루트 디렉토리 배열 설정 */}
								<div className="space-y-2">
									<label
										htmlFor="worktree-scan-root"
										className="text-xs font-semibold dark:text-zinc-300 text-zinc-700 block"
									>
										Git 저장소 스캔 경로
									</label>

									{/* 목록 */}
									<div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 workbench-scrollbar">
										{settingsScanRoots.map((root, index) => (
											<div
												key={root}
												className="flex items-center justify-between rounded-lg border dark:border-white/10 border-black/10 px-3 py-1.5 text-xs dark:bg-black/30 bg-zinc-50"
											>
												<span className="font-mono dark:text-zinc-200 text-zinc-700">
													{root}
												</span>
												<button
													type="button"
													onClick={() => handleRemoveScanRoot(index)}
													className="text-red-500 hover:text-red-400 p-1 transition cursor-pointer"
													title="스캔 루트 제거"
													aria-label={`${root} 스캔 루트 제거`}
												>
													<X className="h-3.5 w-3.5" />
												</button>
											</div>
										))}
										{settingsScanRoots.length === 0 && (
											<p className="text-xs dark:text-zinc-450 text-zinc-500 italic">
												지정된 스캔 경로가 없습니다.
											</p>
										)}
									</div>

									{/* 추가 인풋 */}
									<div className="flex gap-2 pt-1">
										<input
											id="worktree-scan-root"
											type="text"
											placeholder="예: ~/workspaces"
											value={settingsNewRoot}
											onChange={(e) => setSettingsNewRoot(e.target.value)}
											className="flex-1 rounded-lg border dark:border-white/10 border-black/10 px-3 py-1.5 text-xs outline-none dark:bg-black/30 bg-white dark:text-white text-zinc-850 focus:border-[var(--workbench-accent-blue)]/50 focus:ring-1 focus:ring-[var(--workbench-accent-blue)]/50 transition"
										/>
										<button
											type="button"
											onClick={handleAddScanRoot}
											className="rounded-lg dark:bg-white/10 bg-black/10 px-3 py-1.5 text-xs font-semibold dark:text-white text-zinc-700 hover:dark:bg-white/15 hover:bg-black/15 active:scale-95 transition cursor-pointer"
										>
											추가
										</button>
									</div>
								</div>

								{/* 2. 기본 생성 루트 디렉토리 설정 */}
								<div className="space-y-1.5">
									<label
										htmlFor="worktree-default-dir"
										className="text-xs font-semibold dark:text-zinc-300 text-zinc-700"
									>
										기본 워크트리 생성 경로 (Default Directory)
									</label>
									<input
										id="worktree-default-dir"
										type="text"
										value={settingsDefaultDir}
										onChange={(e) => setSettingsDefaultDir(e.target.value)}
										className="w-full rounded-lg border dark:border-white/10 border-black/10 px-3 py-2 text-sm outline-none dark:bg-black/30 bg-white dark:text-white text-zinc-850 focus:border-[var(--workbench-accent-blue)]/50 focus:ring-1 focus:ring-[var(--workbench-accent-blue)]/50 transition"
										required
									/>
									<p className="text-[10px] dark:text-zinc-400 text-zinc-500">
										생성 모달에서 별도 경로 지정이 없을 경우 이 디렉토리 아래에
										폴더가 자동 생성됩니다.
									</p>
								</div>

								{/* 3. 저장 및 닫기 */}
								<div className="flex gap-2 pt-2 justify-end">
									<button
										type="button"
										onClick={() => setIsSettingsModalOpen(false)}
										className="rounded-lg border dark:border-white/10 border-black/10 px-4 py-2 text-xs font-semibold dark:text-zinc-300 text-zinc-650 dark:hover:bg-white/5 hover:bg-black/5 active:scale-95 transition cursor-pointer"
									>
										닫기
									</button>
									<button
										type="submit"
										disabled={savingSettings}
										className="rounded-lg bg-[var(--workbench-accent-blue)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 active:scale-95 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
									>
										{savingSettings && (
											<RefreshCw className="h-3 w-3 animate-spin" />
										)}
										저장하기
									</button>
								</div>
							</form>
						</div>
					</div>
				)}

				{/* ========================================================================= */}
				{/* 워크트리 삭제 확인 모달 */}
				{removeTarget && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
						<ModalSurface className="relative max-w-lg p-6 text-zinc-900 dark:text-white">
							<button
								type="button"
								onClick={() => {
									setRemoveError(null);
									setRemoveTarget(null);
								}}
								className="absolute right-4 top-4 text-zinc-450 transition hover:text-zinc-950 dark:text-white/40 dark:hover:text-white"
								aria-label="워크트리 삭제 확인 닫기"
								disabled={removing}
							>
								<X className="h-5 w-5" aria-hidden="true" />
							</button>

							<div className="flex items-start gap-3">
								<div className="rounded-md border border-[#ff8182]/35 bg-[#ffebe9] p-2 text-[#cf222e] dark:border-[#f85149]/45 dark:bg-[#3d1719] dark:text-[#ff7b72]">
									<Trash2 className="h-5 w-5" aria-hidden="true" />
								</div>
								<div className="min-w-0">
									<h2 className="text-lg font-bold">워크트리 삭제</h2>
									<p className="mt-1 text-xs text-zinc-650 dark:text-zinc-300">
										선택한 보조 worktree를 제거합니다. 삭제 전 대상 정보를
										확인해 주세요.
									</p>
								</div>
							</div>

							<div className="mt-5 space-y-3">
								{removeError && (
									<InlineNotice tone="error" title="워크트리 삭제 실패">
										<div className="space-y-1">
											<p>{removeError}</p>
											<p>필요하면 상태를 확인한 뒤 다시 시도해 주세요.</p>
										</div>
									</InlineNotice>
								)}

								<div className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-3 text-xs dark:border-[#30363d] dark:bg-[#0d1117]">
									<div className="grid gap-2">
										<div>
											<p className="font-semibold text-zinc-500">Project</p>
											<p className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">
												{removeTarget.repoName}
											</p>
										</div>
										<div>
											<p className="font-semibold text-zinc-500">Branch</p>
											<p className="mt-0.5 break-all font-mono text-zinc-850 dark:text-zinc-100">
												{removeTarget.branch}
											</p>
										</div>
										<div>
											<p className="font-semibold text-zinc-500">Path</p>
											<p className="mt-0.5 break-all font-mono text-zinc-850 dark:text-zinc-100">
												{removeTarget.path}
											</p>
										</div>
									</div>
								</div>

								{isAgentTool(removeTarget.type) && (
									<InlineNotice tone="warning" title="에이전트 worktree입니다">
										삭제하면 연결된 에이전트의 현재 작업이 중단될 수 있습니다.
										기존 flow와 동일하게 force remove로 처리합니다.
									</InlineNotice>
								)}
							</div>

							<div className="mt-6 flex justify-end gap-2">
								<button
									type="button"
									onClick={() => {
										setRemoveError(null);
										setRemoveTarget(null);
									}}
									disabled={removing}
									className="rounded-lg border border-black/10 px-4 py-2 text-xs font-semibold text-zinc-650 transition hover:bg-black/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
								>
									취소
								</button>
								<button
									type="button"
									onClick={handleConfirmRemoveWorktree}
									disabled={removing}
									className="flex items-center gap-1.5 rounded-lg bg-[#cf222e] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#a40e26] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#da3633] dark:hover:bg-[#f85149]"
								>
									{removing && <RefreshCw className="h-3 w-3 animate-spin" />}
									삭제
								</button>
							</div>
						</ModalSurface>
					</div>
				)}
			</div>
		</AppShell>
	);
}
