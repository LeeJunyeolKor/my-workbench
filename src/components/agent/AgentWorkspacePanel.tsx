import {
	Code2,
	FileCode2,
	Folder,
	GitBranch,
	Play,
	RefreshCw,
	Square,
	Terminal,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { InlineNotice } from "#/components/ui/InlineNotice";
import { Pill, type PillTone } from "#/components/ui/Pill";
import { surfaceClassName } from "#/components/ui/surfaceClassName";
import { getErrorMessage } from "#/lib/errors";
import {
	type AgentEvent,
	type AgentType,
	appendTaskLog,
	type ChangedFile,
	type ChangeStatus,
	cancelAgentTask,
	createTaskViewState,
	DESKTOP_RUNTIME_REQUIRED_MESSAGE,
	getChangedFiles,
	getDiff,
	hasTauriRuntime,
	isTerminalTaskState,
	listenAgentEvents,
	normalizeTaskId,
	projectTaskState,
	selectWorkspace,
	startAgentTask,
	type Task,
	type TaskExecutionMode,
	type TaskState,
	type TaskViewState,
	taskStatusFromViewState,
} from "#/lib/tauri-ipc";

export interface AgentWorkspacePanelProps {
	initialWorkspacePath?: string;
	initialWorkspaceName?: string;
	executionMode?: TaskExecutionMode;
	compact?: boolean;
	onClose?: () => void;
	onTaskStateChange?: (state: TaskViewState) => void;
	onTaskCancellationReady?: (cancel: (() => Promise<void>) | null) => void;
	onWorkspacePathChange?: (path: string) => void;
}

const MAX_PENDING_START_EVENTS = 256;

const CHANGE_STATUS_LABELS: Record<ChangeStatus, string> = {
	modified: "M",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "??",
};

function changeStatusTone(status: ChangeStatus): PillTone {
	switch (status) {
		case "added":
			return "green";
		case "deleted":
			return "red";
		case "renamed":
			return "violet";
		case "untracked":
			return "amber";
		default:
			return "blue";
	}
}

function taskStatusTone(status: TaskState | null): PillTone {
	switch (status) {
		case "Completed":
			return "green";
		case "Failed":
			return "red";
		case "Cancelled":
			return "neutral";
		case "Preparing":
		case "Running":
			return "amber";
		default:
			return "blue";
	}
}

function taskStatusLabel(status: TaskState | null): string {
	switch (status) {
		case "Created":
			return "생성됨";
		case "Preparing":
			return "준비 중";
		case "Running":
			return "실행 중";
		case "Completed":
			return "완료";
		case "Failed":
			return "실패";
		case "Cancelled":
			return "취소됨";
		default:
			return "대기 중";
	}
}

function appendSystemLog(state: TaskViewState, text: string): TaskViewState {
	return {
		...state,
		logs: appendTaskLog(state.logs, {
			id: `local-${state.logs.length + 1}-${Date.now()}`,
			time: new Date().toLocaleTimeString(),
			stream: "system",
			text,
		}),
	};
}

function isAlreadyFinishedTaskError(error: unknown): boolean {
	return /not found|already finished/i.test(getErrorMessage(error, ""));
}

export function AgentWorkspacePanel({
	initialWorkspacePath = "",
	initialWorkspaceName,
	executionMode = "new-worktree",
	compact = false,
	onClose,
	onTaskStateChange,
	onTaskCancellationReady,
	onWorkspacePathChange,
}: AgentWorkspacePanelProps) {
	const [workspacePath, setWorkspacePath] = useState(initialWorkspacePath);
	const [workspaceName, setWorkspaceName] = useState(
		initialWorkspaceName ?? initialWorkspacePath.split("/").pop() ?? "작업공간",
	);
	const [prompt, setPrompt] = useState(
		"타임스탬프 형식 도우미를 추가하고 README를 갱신해 주세요.",
	);
	const [agentType, setAgentType] = useState<AgentType>("codex");
	const [viewState, setViewState] = useState<TaskViewState>(() =>
		createTaskViewState(),
	);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [diffText, setDiffText] = useState("");
	const [loadingDiff, setLoadingDiff] = useState(false);
	const [panelError, setPanelError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [tauriRuntime, setTauriRuntime] = useState(false);
	const eventsReadyRef = useRef(false);
	const [eventsReady, setEventsReady] = useState(eventsReadyRef.current);
	const terminalEndRef = useRef<HTMLDivElement>(null);
	const refreshKeyRef = useRef<string | null>(null);
	const generationRef = useRef(0);
	const filesRequestRef = useRef(0);
	const selectionRequestRef = useRef(0);
	const startRequestRef = useRef(0);
	const disposedRef = useRef(false);
	const pendingStartEventsRef = useRef<{
		request: number;
		events: AgentEvent[];
	} | null>(null);
	const pendingStartsRef = useRef(new Map<number, Promise<Task>>());
	const cancellationBarrierRef = useRef<Promise<void>>(Promise.resolve());
	const ignoredTaskIdsRef = useRef(new Set<string>());
	const taskIdRef = useRef<string | null>(null);
	const executingRef = useRef(false);

	const isExecuting =
		viewState.status === "Preparing" || viewState.status === "Running";
	const taskBusy = isExecuting || isStarting;
	const currentTask = viewState.task;
	const taskId = viewState.taskId;
	const latestLogId = viewState.logs.at(-1)?.id;

	taskIdRef.current = taskId;
	executingRef.current = isExecuting;

	useEffect(() => {
		setTauriRuntime(hasTauriRuntime());
	}, []);

	const handleSelectFile = useCallback(
		async (
			worktreePath: string,
			filePath: string,
			requestGeneration = generationRef.current,
		) => {
			if (requestGeneration !== generationRef.current) return;
			const selectionRequest = selectionRequestRef.current + 1;
			selectionRequestRef.current = selectionRequest;
			setSelectedFile(filePath);
			setLoadingDiff(true);
			try {
				const diff = await getDiff(worktreePath, filePath);
				if (
					requestGeneration !== generationRef.current ||
					selectionRequest !== selectionRequestRef.current
				) {
					return;
				}
				setDiffText(diff);
			} catch (error) {
				if (
					requestGeneration !== generationRef.current ||
					selectionRequest !== selectionRequestRef.current
				) {
					return;
				}
				setDiffText(getErrorMessage(error, "diff를 불러오지 못했습니다."));
			} finally {
				if (
					requestGeneration === generationRef.current &&
					selectionRequest === selectionRequestRef.current
				) {
					setLoadingDiff(false);
				}
			}
		},
		[],
	);

	const refreshChangedFiles = useCallback(
		async (
			worktreePath: string,
			selectFirst = true,
			requestGeneration = generationRef.current,
		) => {
			const filesRequest = filesRequestRef.current + 1;
			filesRequestRef.current = filesRequest;
			try {
				const files = await getChangedFiles(worktreePath);
				if (
					requestGeneration !== generationRef.current ||
					filesRequest !== filesRequestRef.current
				) {
					return;
				}
				setViewState((state) => ({
					...state,
					changedFiles: files,
				}));
				if (selectFirst && files.length > 0) {
					await handleSelectFile(
						worktreePath,
						files[0].path,
						requestGeneration,
					);
				}
			} catch (error) {
				if (
					requestGeneration !== generationRef.current ||
					filesRequest !== filesRequestRef.current
				) {
					return;
				}
				setPanelError(
					getErrorMessage(error, "변경 파일을 불러오지 못했습니다."),
				);
			}
		},
		[handleSelectFile],
	);

	const cancelTaskAndWait = useCallback(async () => {
		const taskIds = new Set<string>();
		const activeTaskId = taskIdRef.current;
		const activeTaskIsExecuting = executingRef.current;
		const pendingStarts = [...pendingStartsRef.current.values()];
		const pendingResults = await Promise.allSettled(pendingStarts);

		for (const result of pendingResults) {
			if (result.status !== "fulfilled") continue;
			const task = result.value;
			if (!isTerminalTaskState(task.status.state)) {
				taskIds.add(normalizeTaskId(task.id));
			}
		}

		if (activeTaskId && activeTaskIsExecuting) {
			taskIds.add(activeTaskId);
		}

		for (const taskId of taskIds) {
			try {
				await cancelAgentTask(taskId);
			} catch (error) {
				if (!isAlreadyFinishedTaskError(error)) {
					throw error;
				}
			}
		}
	}, []);

	const requestCancellation = useCallback(() => {
		const cancellation = cancellationBarrierRef.current.then(() =>
			cancelTaskAndWait(),
		);
		cancellationBarrierRef.current = cancellation.catch(() => undefined);
		return cancellation;
	}, [cancelTaskAndWait]);

	useEffect(() => {
		const previousTaskId = taskIdRef.current;
		if (previousTaskId) {
			ignoredTaskIdsRef.current.add(previousTaskId);
		}
		generationRef.current += 1;
		filesRequestRef.current += 1;
		selectionRequestRef.current += 1;
		startRequestRef.current += 1;
		pendingStartEventsRef.current = null;
		setIsStarting(false);
		void requestCancellation().catch(() => undefined);

		setWorkspacePath(initialWorkspacePath);
		setWorkspaceName(
			initialWorkspaceName ??
				initialWorkspacePath.split("/").pop() ??
				"작업공간",
		);
		setViewState(createTaskViewState());
		setSelectedFile(null);
		setDiffText("");
		setLoadingDiff(false);
		setPanelError(null);
		refreshKeyRef.current = null;
	}, [initialWorkspaceName, initialWorkspacePath, requestCancellation]);

	useEffect(() => {
		let disposed = false;
		let unlisten: (() => void) | null = null;
		eventsReadyRef.current = false;
		setEventsReady(false);

		if (!tauriRuntime) {
			return () => {
				disposed = true;
			};
		}

		void listenAgentEvents((event) => {
			const eventTaskId = normalizeTaskId(event.payload.task_id);
			if (disposedRef.current || ignoredTaskIdsRef.current.has(eventTaskId)) {
				return;
			}

			const pendingStart = pendingStartEventsRef.current;
			if (pendingStart) {
				if (pendingStart.events.length < MAX_PENDING_START_EVENTS) {
					pendingStart.events.push(event);
				}
				return;
			}

			const activeTaskId = taskIdRef.current;
			if (!activeTaskId || activeTaskId !== eventTaskId) return;
			setViewState((state) => projectTaskState(state, event));
		})
			.then((cleanup) => {
				if (disposed) {
					cleanup();
				} else {
					unlisten = cleanup;
					eventsReadyRef.current = true;
					setEventsReady(true);
				}
			})
			.catch((error) => {
				if (!disposed) {
					setPanelError(
						getErrorMessage(
							error,
							"에이전트 이벤트 구독을 준비하지 못했습니다.",
						),
					);
				}
			});

		return () => {
			disposed = true;
			eventsReadyRef.current = false;
			unlisten?.();
		};
	}, [tauriRuntime]);

	useEffect(() => {
		if (latestLogId) {
			terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [latestLogId]);

	useEffect(() => {
		onTaskStateChange?.(viewState);
	}, [onTaskStateChange, viewState]);

	useEffect(() => {
		onTaskCancellationReady?.(requestCancellation);
		return () => onTaskCancellationReady?.(null);
	}, [onTaskCancellationReady, requestCancellation]);

	useEffect(() => {
		return () => {
			disposedRef.current = true;
			generationRef.current += 1;
			filesRequestRef.current += 1;
			selectionRequestRef.current += 1;
			startRequestRef.current += 1;
			pendingStartEventsRef.current = null;
			void requestCancellation().catch(() => undefined);
		};
	}, [requestCancellation]);

	useEffect(() => {
		const terminal = viewState.status;
		const worktreePath = viewState.worktreePath;
		if (
			!taskId ||
			!worktreePath ||
			(terminal !== "Completed" &&
				terminal !== "Failed" &&
				terminal !== "Cancelled")
		) {
			return;
		}

		const refreshKey = `${taskId}:${terminal}:${worktreePath}`;
		if (refreshKeyRef.current === refreshKey) return;
		refreshKeyRef.current = refreshKey;
		void refreshChangedFiles(worktreePath, false);
	}, [refreshChangedFiles, taskId, viewState.status, viewState.worktreePath]);

	async function handleSelectWorkspace() {
		const path = workspacePath.trim();
		if (!path) {
			setPanelError("먼저 Git 작업공간 경로를 입력해 주세요.");
			return;
		}

		try {
			const workspace = await selectWorkspace(path);
			const previousTaskId = taskIdRef.current;
			if (previousTaskId) {
				ignoredTaskIdsRef.current.add(previousTaskId);
			}
			generationRef.current += 1;
			filesRequestRef.current += 1;
			selectionRequestRef.current += 1;
			startRequestRef.current += 1;
			pendingStartEventsRef.current = null;
			setIsStarting(false);
			await requestCancellation();
			setWorkspacePath(workspace.path);
			onWorkspacePathChange?.(workspace.path);
			setWorkspaceName(workspace.name);
			setPanelError(null);
			setSelectedFile(null);
			setDiffText("");
			setLoadingDiff(false);
			refreshKeyRef.current = null;
			setViewState(createTaskViewState());
		} catch (error) {
			setPanelError(getErrorMessage(error, "작업공간을 선택하지 못했습니다."));
		}
	}

	async function handleStartTask() {
		if (isStarting || disposedRef.current) return;
		if (!tauriRuntime) {
			setPanelError(DESKTOP_RUNTIME_REQUIRED_MESSAGE);
			return;
		}
		if (!eventsReadyRef.current) {
			setPanelError("에이전트 이벤트 구독을 준비하는 중입니다.");
			return;
		}
		const path = workspacePath.trim();
		const instruction = prompt.trim();
		if (!path || !instruction) {
			setPanelError("작업공간 경로와 작업 지시를 모두 입력해 주세요.");
			return;
		}

		setIsStarting(true);
		try {
			await requestCancellation();
		} catch (error) {
			setIsStarting(false);
			setPanelError(getErrorMessage(error, "이전 작업을 취소하지 못했습니다."));
			return;
		}
		if (disposedRef.current) {
			setIsStarting(false);
			return;
		}

		const previousTaskId = taskIdRef.current;
		if (previousTaskId) {
			ignoredTaskIdsRef.current.add(previousTaskId);
		}
		const requestGeneration = generationRef.current + 1;
		generationRef.current = requestGeneration;
		filesRequestRef.current += 1;
		selectionRequestRef.current += 1;
		const startRequest = startRequestRef.current + 1;
		startRequestRef.current = startRequest;
		pendingStartEventsRef.current = { request: startRequest, events: [] };
		setIsStarting(true);

		setPanelError(null);
		setSelectedFile(null);
		setDiffText("");
		setLoadingDiff(false);
		refreshKeyRef.current = null;
		setViewState(createTaskViewState());

		const startPromise = startAgentTask(
			path,
			instruction,
			agentType,
			executionMode,
		);
		pendingStartsRef.current.set(startRequest, startPromise);

		try {
			const task = await startPromise;
			const nextTaskId = normalizeTaskId(task.id);
			if (
				disposedRef.current ||
				requestGeneration !== generationRef.current ||
				startRequest !== startRequestRef.current
			) {
				if (pendingStartEventsRef.current?.request === startRequest) {
					pendingStartEventsRef.current = null;
				}
				await cancelAgentTask(nextTaskId).catch(() => undefined);
				return;
			}
			const bufferedStartEvents =
				pendingStartEventsRef.current?.request === startRequest
					? pendingStartEventsRef.current.events
					: [];
			pendingStartEventsRef.current = null;
			taskIdRef.current = nextTaskId;
			executingRef.current =
				task.status.state === "Preparing" || task.status.state === "Running";
			setViewState((state) => {
				if (state.taskId && state.taskId !== nextTaskId) {
					return state;
				}

				const projectedStatus =
					state.status === null
						? task.status
						: (taskStatusFromViewState(state) ?? task.status);
				const statusDetails =
					state.status === null
						? task.status.state === "Failed"
							? task.status.details
							: null
						: state.statusDetails;
				let nextState: TaskViewState = {
					...state,
					task: { ...task, status: projectedStatus },
					taskId: nextTaskId,
					status: state.status ?? task.status.state,
					statusDetails,
					worktreePath: state.worktreePath ?? task.worktree_path ?? null,
					branchName: state.branchName ?? task.branch_name ?? null,
					error:
						state.status === null
							? task.status.state === "Failed"
								? task.status.details
								: null
							: state.error,
				};
				for (const event of bufferedStartEvents) {
					if (normalizeTaskId(event.payload.task_id) === nextTaskId) {
						nextState = projectTaskState(nextState, event);
					}
				}
				return nextState;
			});
		} catch (error) {
			if (pendingStartEventsRef.current?.request === startRequest) {
				pendingStartEventsRef.current = null;
			}
			if (
				disposedRef.current ||
				requestGeneration !== generationRef.current ||
				startRequest !== startRequestRef.current
			) {
				return;
			}
			setPanelError(
				getErrorMessage(error, "에이전트 작업을 시작하지 못했습니다."),
			);
			setViewState((state) => appendSystemLog(state, "작업 시작 실패"));
		} finally {
			if (pendingStartsRef.current.get(startRequest) === startPromise) {
				pendingStartsRef.current.delete(startRequest);
			}
			if (!disposedRef.current && startRequest === startRequestRef.current) {
				setIsStarting(false);
			}
		}
	}

	async function handleCancelTask() {
		if (!taskId) return;
		try {
			await requestCancellation();
			setViewState((state) => appendSystemLog(state, "취소 요청됨"));
		} catch (error) {
			setPanelError(getErrorMessage(error, "작업 취소를 요청하지 못했습니다."));
		}
	}

	return (
		<div className={surfaceClassName("space-y-5 p-5")}>
			<div className="flex flex-col gap-2 border-b border-[#d0d7de] pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-[#30363d]">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-bold text-[#24292f] dark:text-[#f0f6fc]">
						<Code2 className="h-5 w-5 text-indigo-500" />
						에이전트 작업공간
					</h2>
					<p className="mt-1 text-xs text-[#57606a] dark:text-[#8b949e]">
						작업 → 명령 → 이벤트 스트림 → 상태 반영
						{compact ? " · 선택한 워크트리" : ""}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Pill variant="status" tone={taskStatusTone(viewState.status)}>
						{taskStatusLabel(viewState.status)}
					</Pill>
					{onClose ? (
						<button
							type="button"
							onClick={onClose}
							className="rounded-md p-1.5 text-zinc-500 transition hover:bg-black/5 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
							aria-label="에이전트 작업대 닫기"
						>
							<X className="h-4 w-4" />
						</button>
					) : null}
				</div>
			</div>

			{panelError ? (
				<InlineNotice tone="error" title="에이전트 작업공간 오류">
					{panelError}
				</InlineNotice>
			) : null}

			{!tauriRuntime ? (
				<InlineNotice tone="warning" title="데스크톱 앱이 필요합니다">
					브라우저에서는 실제 작업을 시작하지 않습니다. 에이전트 실행·취소와 Git
					변경 조회는 My Workbench 데스크톱 앱을 사용해 주세요.
				</InlineNotice>
			) : null}

			<div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
				<div className="space-y-5">
					<div className={surfaceClassName("space-y-3 p-4")}>
						<h3 className="flex items-center gap-2 text-sm font-semibold">
							<Folder className="h-4 w-4 text-blue-500" />
							작업공간
						</h3>
						<label
							className="block text-[11px] font-medium text-zinc-500"
							htmlFor="agent-workspace-path"
						>
							로컬 저장소 경로
						</label>
						<div className="flex gap-2">
							<input
								id="agent-workspace-path"
								type="text"
								value={workspacePath}
								onChange={(event) => setWorkspacePath(event.target.value)}
								disabled={!tauriRuntime}
								placeholder="~/workspaces/repository"
								className="min-w-0 flex-1 rounded-md border border-[#d0d7de] bg-white px-2.5 py-1.5 font-mono text-xs dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#c9d1d9]"
							/>
							<button
								type="button"
								onClick={handleSelectWorkspace}
								disabled={!tauriRuntime}
								className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
							>
								선택
							</button>
						</div>
						<p
							className="truncate font-mono text-[11px] text-zinc-500"
							title={workspacePath}
						>
							{workspaceName || "작업공간 미선택"}
						</p>
					</div>

					<div className={surfaceClassName("space-y-3 p-4")}>
						<h3 className="flex items-center gap-2 text-sm font-semibold">
							<Play className="h-4 w-4 text-emerald-500" />
							에이전트 작업 실행
						</h3>
						<label
							className="block text-[11px] font-medium text-zinc-500"
							htmlFor="agent-runner-type"
						>
							에이전트 실행기
						</label>
						<select
							id="agent-runner-type"
							value={agentType}
							onChange={(event) =>
								setAgentType(event.target.value as AgentType)
							}
							disabled={!tauriRuntime || taskBusy}
							className="w-full rounded-md border border-[#d0d7de] bg-white px-2.5 py-1.5 font-mono text-xs dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#c9d1d9]"
						>
							<option value="codex">Codex CLI</option>
							<option value="claude">Claude CLI</option>
						</select>
						<label
							className="block text-[11px] font-medium text-zinc-500"
							htmlFor="agent-task-prompt"
						>
							작업 지시
						</label>
						<textarea
							id="agent-task-prompt"
							rows={4}
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							disabled={!tauriRuntime || taskBusy}
							className="w-full rounded-md border border-[#d0d7de] bg-white p-2.5 font-mono text-xs dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#c9d1d9]"
						/>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={handleStartTask}
								disabled={!tauriRuntime || taskBusy || !eventsReady}
								className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{taskBusy ? (
									<RefreshCw className="h-4 w-4 animate-spin" />
								) : (
									<Play className="h-4 w-4" />
								)}
								작업 시작
							</button>
							{isExecuting ? (
								<button
									type="button"
									onClick={handleCancelTask}
									className="flex items-center gap-1 rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700"
								>
									<Square className="h-3.5 w-3.5" />
									취소
								</button>
							) : null}
						</div>
					</div>

					{currentTask ? (
						<div
							className={surfaceClassName(
								"space-y-2 p-4 font-mono text-[11px]",
							)}
						>
							<div className="flex items-center justify-between border-b border-[#d0d7de] pb-2 dark:border-[#30363d]">
								<span className="font-semibold">{taskId}</span>
								<Pill variant="status" tone={taskStatusTone(viewState.status)}>
									{taskStatusLabel(viewState.status)}
								</Pill>
							</div>
							<div>
								<span className="text-zinc-500">워크트리</span>
								<p className="mt-0.5 break-all text-zinc-700 dark:text-zinc-300">
									{viewState.worktreePath ?? "준비 중…"}
								</p>
							</div>
							{viewState.branchName ? (
								<div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
									<GitBranch className="h-3.5 w-3.5" />
									{viewState.branchName}
								</div>
							) : null}
							{viewState.error ? (
								<p className="text-rose-600 dark:text-rose-400">
									{viewState.error}
								</p>
							) : null}
						</div>
					) : null}
				</div>

				<div className="space-y-5">
					<div className={surfaceClassName("space-y-3 p-4")}>
						<div className="flex items-center justify-between">
							<h3 className="flex items-center gap-2 text-sm font-semibold">
								<Terminal className="h-4 w-4 text-purple-500" />
								실시간 터미널 출력
							</h3>
							<span className="font-mono text-[11px] text-zinc-500">
								로그 {viewState.logs.length}개
							</span>
						</div>
						<div className="h-56 overflow-y-auto rounded-md bg-[#0d1117] p-3 font-mono text-[11px] text-[#c9d1d9] shadow-inner">
							{viewState.logs.length === 0 ? (
								<div className="flex h-full items-center justify-center text-[#484f58]">
									작업 실행 대기 중…
								</div>
							) : (
								viewState.logs.map((log) => (
									<div key={log.id} className="flex gap-2 leading-relaxed">
										<span className="select-none text-[#484f58]">
											{log.time}
										</span>
										<span
											className={
												log.stream === "stderr"
													? "font-semibold text-rose-400"
													: log.stream === "system"
														? "font-medium text-cyan-400"
														: "text-[#c9d1d9]"
											}
										>
											{log.text}
										</span>
									</div>
								))
							)}
							<div ref={terminalEndRef} />
						</div>
					</div>

					<div className={surfaceClassName("space-y-4 p-4")}>
						<div className="flex items-center justify-between gap-2">
							<h3 className="flex items-center gap-2 text-sm font-semibold">
								<FileCode2 className="h-4 w-4 text-amber-500" />
								변경 파일과 diff
							</h3>
							{viewState.worktreePath ? (
								<button
									type="button"
									onClick={() =>
										void refreshChangedFiles(viewState.worktreePath ?? "")
									}
									className="flex items-center gap-1 rounded-md bg-black/5 px-2 py-1 text-[11px] transition hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
								>
									<RefreshCw className="h-3 w-3" /> 새로고침
								</button>
							) : null}
						</div>
						{viewState.changedFiles.length === 0 ? (
							<p className="py-5 text-center text-xs text-zinc-500">
								아직 변경된 파일이 없습니다.
							</p>
						) : (
							<div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(150px,0.8fr)_minmax(0,1.4fr)]">
								<div className="min-w-0 space-y-1">
									{viewState.changedFiles.map((file: ChangedFile) => (
										<button
											key={file.path}
											type="button"
											onClick={() =>
												viewState.worktreePath &&
												void handleSelectFile(viewState.worktreePath, file.path)
											}
											className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition ${selectedFile === file.path ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
										>
											<span className="min-w-0 truncate" title={file.path}>
												{file.path}
											</span>
											<Pill
												variant="status"
												tone={changeStatusTone(file.status)}
												className="text-[10px]"
											>
												{CHANGE_STATUS_LABELS[file.status]}
											</Pill>
										</button>
									))}
								</div>
								<div className="min-h-40 min-w-0 overflow-x-auto rounded-md bg-[#0d1117] p-3 font-mono text-[11px] text-[#c9d1d9]">
									{loadingDiff ? (
										<div className="text-[#484f58]">diff 불러오는 중…</div>
									) : diffText ? (
										<pre className="whitespace-pre-wrap">{diffText}</pre>
									) : (
										<div className="text-[#484f58]">
											파일을 선택하면 diff를 확인할 수 있습니다.
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
