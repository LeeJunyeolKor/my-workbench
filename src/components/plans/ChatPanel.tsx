import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	AlertCircle,
	ArrowDownToLine,
	ArrowRightToLine,
	Check,
	ChevronDown,
	ChevronUp,
	FileText,
	GripVertical,
	Loader2,
	MessageSquare,
	Minimize2,
	PanelBottom,
	PanelLeft,
	PanelRight,
	Play,
	Send,
	Sparkles,
	Terminal,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "#/hooks/useIsMobile";
import { getErrorMessage } from "#/lib/errors";
import {
	approveChatChangeFn,
	type ChatHistory,
	type ChatMessage,
	getChatHistoryFn,
	sendChatMessageFn,
} from "#/server/plans";

interface ChatPanelProps {
	taskId: string;
	currentFile: string;
	agentType: string;
	onAgentTypeChange?: (type: string) => void;
	cliPath: string;
	selectedText: string | null;
	clearSelection: () => void;

	chatPosition?: "side" | "bottom";
	chatDock?: "floating" | "left" | "right" | "bottom";
	chatWidth?: number;
	chatHeight?: number;
	onPositionChange?: (pos: "side" | "bottom") => void;
	onDockChange?: (dock: "floating" | "left" | "right" | "bottom") => void;
	onOpenChange?: (open: boolean) => void;
	onWidthChange?: (width: number) => void;
	onHeightChange?: (height: number) => void;
}

function getMessageBaseKey(message: ChatMessage) {
	return [message.role, message.selectedText ?? "", message.content].join(
		"\u001f",
	);
}

export function ChatPanel({
	taskId,
	currentFile,
	agentType,
	onAgentTypeChange,
	cliPath,
	selectedText,
	clearSelection,
	chatPosition = "side",
	chatDock = chatPosition === "bottom" ? "bottom" : "floating",
	chatWidth = 260,
	chatHeight = 360,
	onPositionChange,
	onDockChange,
	onOpenChange,
	onWidthChange,
	onHeightChange,
}: ChatPanelProps) {
	const router = useRouter();
	const [history, setHistory] = useState<ChatHistory | null>(null);
	const [inputValue, setInputValue] = useState("");
	const [showTerminal, setShowTerminal] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	const getChatHistory = useServerFn(getChatHistoryFn);
	const sendChatMessage = useServerFn(sendChatMessageFn);
	const approveChatChange = useServerFn(approveChatChangeFn);

	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const terminalContainerRef = useRef<HTMLDivElement | HTMLPreElement | null>(
		null,
	);
	const setTerminalContainerRef = (
		node: HTMLDivElement | HTMLPreElement | null,
	) => {
		terminalContainerRef.current = node;
	};

	// 모바일/태블릿(768px 이하) 가드: 드래그 도킹·리사이즈 제스처 차단
	const isMobile = useIsMobile();
	const messageScrollKey = history
		? [
				history.status,
				history.messages.length,
				history.messages.at(-1)?.content ?? "",
			].join("\u001f")
		: "";
	const liveLogScrollKey = history?.liveLog.length ?? 0;

	// 드래그앤드롭 도킹 상태
	const [isDraggingDock, setIsDraggingDock] = useState(false);
	const [floatingPos, setFloatingPos] = useState({ x: 0, y: 0 });
	const [activeDockTarget, setActiveDockTarget] = useState<
		"side" | "bottom" | null
	>(null);

	const handleDockDragStart = (e: React.MouseEvent) => {
		if (isMobile) return; // 좁은 화면에서는 도킹 제스처 오동작 방지를 위해 차단
		if (e.button !== 0) return;
		e.preventDefault();

		const startX = e.clientX;
		const startY = e.clientY;

		// 드래그 핸들 자체의 위치와 마우스 클릭 위치 간의 오프셋 계산
		const handleEl = e.currentTarget as HTMLElement;
		const handleRect = handleEl.getBoundingClientRect();

		// 마우스가 핸들 내부에서 클릭된 상대적 위치
		const clickOffsetX = startX - handleRect.left;
		const clickOffsetY = startY - handleRect.top;

		// 플로팅 패널 내부(p-4 패딩 포함)에서 드래그 핸들이 위치할 가상의 상대 위치
		const handleInPanelX = 18;
		const handleInPanelY = 18;

		// 드래그 중인 패널의 좌상단 기준 마우스 포인터의 상대 거리(오프셋)
		const initialX = handleInPanelX + clickOffsetX;
		const initialY = handleInPanelY + clickOffsetY;

		setIsDraggingDock(true);
		setFloatingPos({ x: startX - initialX, y: startY - initialY });
		setActiveDockTarget(null);

		const handleMouseMove = (moveEvent: MouseEvent) => {
			const x = moveEvent.clientX - initialX;
			const y = moveEvent.clientY - initialY;
			setFloatingPos({ x, y });

			const thresholdBottom = window.innerHeight * 0.75;
			const thresholdSide = window.innerWidth * 0.8;

			if (moveEvent.clientY > thresholdBottom) {
				setActiveDockTarget("bottom");
			} else if (moveEvent.clientX > thresholdSide) {
				setActiveDockTarget("side");
			} else {
				setActiveDockTarget(null);
			}
		};

		const handleMouseUp = (upEvent: MouseEvent) => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "";

			setIsDraggingDock(false);

			const thresholdBottom = window.innerHeight * 0.75;
			const thresholdSide = window.innerWidth * 0.8;

			let finalTarget: "side" | "bottom" | null = null;
			if (upEvent.clientY > thresholdBottom) {
				finalTarget = "bottom";
			} else if (upEvent.clientX > thresholdSide) {
				finalTarget = "side";
			}

			if (finalTarget && onPositionChange) {
				onPositionChange(finalTarget);
			}
			setActiveDockTarget(null);
		};

		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	};

	// 1. 주기적인 폴링 연동 (2초 간격)
	useEffect(() => {
		let timer: NodeJS.Timeout;

		const fetchHistory = async () => {
			try {
				const res = await getChatHistory({ data: { taskId } });
				setHistory(res);

				if (res.status === "completed" && history?.status === "running") {
					await router.invalidate();
				}
			} catch (err) {
				console.error("Failed to poll chat history", err);
			}
		};

		fetchHistory();
		timer = setInterval(fetchHistory, 2000);

		return () => clearInterval(timer);
	}, [taskId, history?.status, getChatHistory, router.invalidate]);

	// 드래그 도중 화면이 모바일 폭으로 줄어들면 진행 중인 도킹 드래그를 즉시 해제
	useEffect(() => {
		if (isMobile && isDraggingDock) {
			setIsDraggingDock(false);
			setActiveDockTarget(null);
			document.body.style.userSelect = "";
		}
	}, [isMobile, isDraggingDock]);

	// 2. 메시지 추가 시 스크롤 제어
	// biome-ignore lint/correctness/useExhaustiveDependencies: this effect intentionally scrolls when the derived message key changes
	useEffect(() => {
		if (messagesContainerRef.current) {
			messagesContainerRef.current.scrollTop =
				messagesContainerRef.current.scrollHeight;
		}
	}, [messageScrollKey, chatPosition]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: this effect intentionally scrolls when live log length changes
	useEffect(() => {
		if (chatPosition === "bottom") {
			if (terminalContainerRef.current) {
				terminalContainerRef.current.scrollTop =
					terminalContainerRef.current.scrollHeight;
			}
		} else if (showTerminal) {
			if (terminalContainerRef.current) {
				terminalContainerRef.current.scrollTop =
					terminalContainerRef.current.scrollHeight;
			}
		}
	}, [liveLogScrollKey, showTerminal, chatPosition]);

	// 3. 메시지 전송
	const handleSendMessage = async (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!inputValue.trim() || isSubmitting || history?.status === "running")
			return;

		setIsSubmitting(true);
		setActionError(null);
		const pendingMsg = inputValue;
		setInputValue("");

		try {
			await sendChatMessage({
				data: {
					taskId,
					message: pendingMsg,
					selectedText: selectedText || undefined,
					filename: currentFile,
					agentType,
					cliPath,
				},
			});
			clearSelection();
			setShowTerminal(true);
		} catch (err) {
			console.error(err);
			setActionError(getErrorMessage(err, "메시지 전송에 실패했습니다."));
			setInputValue(pendingMsg);
		} finally {
			setIsSubmitting(false);
		}
	};

	// 4. 에이전트 액션 승인/거절 처리
	const handleApproveAction = async (approve: boolean) => {
		setActionError(null);
		try {
			await approveChatChange({
				data: {
					taskId,
					approve,
				},
			});
			if (approve) {
				setTimeout(async () => {
					await router.invalidate();
				}, 1000);
			}
		} catch (err) {
			console.error(err);
			setActionError(
				getErrorMessage(err, "요청 처리 도중 에러가 발생했습니다."),
			);
		}
	};

	// Width 리사이즈 마우스 드래그 이벤트 핸들러 (우측 배치 시)
	const handleWidthMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		if (!onWidthChange) return;

		const startX = e.clientX;
		const startWidth = chatWidth;

		const handleMouseMove = (moveEvent: MouseEvent) => {
			const deltaX =
				chatDock === "left"
					? moveEvent.clientX - startX
					: startX - moveEvent.clientX;
			const newWidth = startWidth + deltaX;
			onWidthChange(newWidth);
		};

		const handleMouseUp = () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "";
		};

		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	};

	// Height 리사이즈 마우스 드래그 이벤트 핸들러 (하단 배치 시)
	const handleHeightMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		if (!onHeightChange) return;

		const startY = e.clientY;
		const startHeight = chatHeight;

		const handleMouseMove = (moveEvent: MouseEvent) => {
			const deltaY = startY - moveEvent.clientY;
			const newHeight = startHeight + deltaY;
			onHeightChange(newHeight);
		};

		const handleMouseUp = () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "";
		};

		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	};

	const isRunning = history?.status === "running";
	const isWaitingApproval = history?.status === "waiting_approval";

	const renderMessages = () => {
		if (!history || history.messages.length === 0) {
			return (
				<div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-255 dark:border-zinc-800 rounded-xl select-none my-auto">
					<span className="text-3xl mb-2.5">💡</span>
					<h4 className="text-xs font-bold text-zinc-750 dark:text-zinc-350">
						문서 기반 대화 시작하기
					</h4>
					<p className="text-[10px] leading-relaxed text-zinc-550 dark:text-zinc-500 mt-1 max-w-[200px]">
						본문 텍스트를 드래그하여 질문하거나, 하단에 기획 관련 아키텍처
						의문이나 지시사항을 남겨보세요.
					</p>
				</div>
			);
		}

		const seenMessageKeys = new Map<string, number>();

		return (
			<div className="space-y-4">
				{history.messages.map((msg) => {
					const isUser = msg.role === "user";
					const isSystem = msg.role === "system";
					const baseKey = getMessageBaseKey(msg);
					const seenCount = seenMessageKeys.get(baseKey) ?? 0;
					seenMessageKeys.set(baseKey, seenCount + 1);
					const messageKey =
						seenCount === 0 ? baseKey : `${baseKey}\u001f${seenCount}`;

					if (isSystem) {
						return (
							<div
								key={messageKey}
								className="flex justify-center select-none py-1"
							>
								<span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-950 px-2.5 py-1 rounded-md border dark:border-zinc-900 border-zinc-200">
									ℹ️ {msg.content}
								</span>
							</div>
						);
					}

					return (
						<div
							key={messageKey}
							className={`flex flex-col max-w-[85%] ${isUser ? "ml-auto items-end" : "mr-auto items-start"}`}
						>
							{isUser && msg.selectedText && (
								<div className="mb-1 p-1.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 max-w-full text-[10px] text-zinc-500 dark:text-zinc-400 font-mono italic truncate">
									참조: "{msg.selectedText}"
								</div>
							)}

							<div
								className={`p-3 rounded-2xl shadow-sm ${
									isUser
										? "bg-indigo-600 text-white rounded-tr-none"
										: "dark:bg-zinc-800 bg-zinc-150 text-zinc-850 dark:text-zinc-100 rounded-tl-none border dark:border-zinc-750/30 border-zinc-200"
								}`}
							>
								<p className="whitespace-pre-wrap break-words">{msg.content}</p>
							</div>
						</div>
					);
				})}

				{isWaitingApproval && (
					<div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/5 text-xs shadow-md animate-fadeIn space-y-3 mt-4">
						<div className="flex items-start gap-2.5">
							{history.actionType === "file_edit" && (
								<FileText className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
							)}
							{history.actionType === "command_exec" && (
								<Play className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
							)}
							{history.actionType === "tool_call" && (
								<Sparkles className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
							)}

							<div>
								<h4 className="font-bold dark:text-white text-zinc-900">
									{history.actionType === "file_edit" && "문서 변경 사항 승인"}
									{history.actionType === "command_exec" && "명령어 실행 승인"}
									{history.actionType === "tool_call" &&
										"에이전트 도구 구동 승인"}
								</h4>
								<p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
									{history.actionType === "file_edit" && (
										<>
											문서 파일{" "}
											<code className="font-bold text-indigo-500">
												{history.actionDetail}
											</code>
											의 수정 변경본을 실제 문서에 최종 반영하시겠습니까?
										</>
									)}
									{history.actionType === "command_exec" && (
										<>
											에이전트가 로컬 터미널에서 다음 쉘 명령을 구동하도록
											허용하시겠습니까?{" "}
											<code className="font-mono text-emerald-500 block mt-1 p-1 bg-black/30 rounded text-[9px]">
												{history.actionDetail}
											</code>
										</>
									)}
									{history.actionType === "tool_call" && (
										<>
											에이전트가{" "}
											<code className="font-bold text-purple-500">
												{history.actionDetail}
											</code>{" "}
											도구를 호출하여 로컬 연산을 계속 진행하는 것을
											허용하시겠습니까?
										</>
									)}
								</p>
							</div>
						</div>

						<div className="flex items-center gap-2 pt-1">
							<button
								type="button"
								onClick={() => handleApproveAction(false)}
								className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold transition cursor-pointer select-none text-[10px]"
							>
								<X className="h-3 w-3" />
								반영 거절
							</button>
							<button
								type="button"
								onClick={() => handleApproveAction(true)}
								className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-750 text-white font-semibold transition cursor-pointer select-none text-[10px] shadow-sm"
							>
								<Check className="h-3 w-3" />
								최종 승인
							</button>
						</div>
					</div>
				)}
			</div>
		);
	};

	const renderInputPanel = () => {
		return (
			<div className="mt-auto shrink-0 border-t border-zinc-200 dark:border-zinc-800 pt-3 flex flex-col gap-2">
				{selectedText && (
					<div className="flex items-center justify-between p-1.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 select-none animate-fadeIn">
						<span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[80%] font-mono italic">
							📌 참조 구절: "{selectedText}"
						</span>
						<button
							type="button"
							onClick={clearSelection}
							title="참조 구절 선택 해제"
							aria-label="참조 구절 선택 해제"
							className="text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 p-0.5 rounded transition"
						>
							<X className="h-3 w-3" />
						</button>
					</div>
				)}

				{actionError && (
					<div className="flex items-start gap-1.5 text-[10px] text-red-650 dark:text-red-400 animate-fadeIn font-semibold max-w-full break-all leading-normal">
						<AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
						<span>{actionError}</span>
					</div>
				)}

				<form onSubmit={handleSendMessage} className="flex gap-2">
					<input
						type="text"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						placeholder={
							isRunning
								? "에이전트가 연산 중입니다..."
								: "문서 내용에 대해 질문하거나 지시를 내려보세요..."
						}
						className="flex-1 text-xs rounded-lg border border-zinc-255 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition disabled:opacity-50"
						disabled={isRunning || isSubmitting || isWaitingApproval}
					/>
					<button
						type="submit"
						aria-label="메시지 보내기"
						disabled={
							!inputValue.trim() ||
							isRunning ||
							isSubmitting ||
							isWaitingApproval
						}
						className="flex items-center justify-center p-2.5 rounded-lg text-white disabled:opacity-40 disabled:hover:opacity-40 transition-all cursor-pointer shadow-md select-none shrink-0"
						style={{
							background: "var(--workbench-btn-primary)",
							color: "var(--workbench-btn-primary-text)",
						}}
					>
						{isSubmitting ? (
							<Loader2 className="h-4 w-4 animate-spin text-white" />
						) : (
							<Send className="h-4 w-4" />
						)}
					</button>
				</form>
			</div>
		);
	};

	let panelStyle: React.CSSProperties =
		chatPosition === "bottom"
			? { height: `${chatHeight}px` }
			: { height: "100%" };

	if (isDraggingDock) {
		panelStyle = {
			position: "fixed",
			left: `${floatingPos.x}px`,
			top: `${floatingPos.y}px`,
			width: `${chatWidth}px`,
			height: "450px",
			zIndex: 50,
			pointerEvents: "none",
			opacity: 0.8,
			boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
			transition: "none",
		};
	}

	const roundedClasses =
		chatPosition === "bottom" && !isDraggingDock
			? "rounded-t-xl rounded-b-none border-x-0 border-b-0"
			: "rounded-xl";
	const layoutToggleLabel =
		chatPosition === "side"
			? "하단 레이아웃으로 전환"
			: "사이드바 레이아웃으로 전환";

	const chatDOM = (
		<div
			style={panelStyle}
			className={`relative p-4 dark:bg-zinc-900/60 bg-white/75 border dark:border-white/10 border-black/5 backdrop-blur-md shadow-sm flex flex-col w-full h-full min-h-[250px] ${roundedClasses}`}
		>
			{/* 1. 드래그 핸들 바 (모바일에서는 리사이즈 제스처 비활성화) */}
			{!isMobile && chatPosition === "side" && onWidthChange && (
				<button
					type="button"
					onMouseDown={handleWidthMouseDown}
					className={`absolute top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-indigo-500/50 active:bg-indigo-500/80 transition-colors z-20 group border-0 bg-transparent p-0 ${
						chatDock === "left" ? "right-0" : "left-0"
					}`}
					title="드래그하여 너비 조절"
					aria-label="채팅 패널 너비 조절"
				>
					{/* 시각적 피드백 선 */}
					<div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-[2px] h-8 bg-zinc-400/30 group-hover:bg-indigo-400 rounded" />
				</button>
			)}
			{!isMobile && chatPosition === "bottom" && onHeightChange && (
				<button
					type="button"
					onMouseDown={handleHeightMouseDown}
					className="absolute left-0 right-0 top-0 h-1.5 cursor-ns-resize hover:bg-indigo-500/50 active:bg-indigo-500/80 transition-colors z-20 group border-0 bg-transparent p-0"
					title="드래그하여 높이 조절"
					aria-label="채팅 패널 높이 조절"
				>
					{/* 시각적 피드백 선 */}
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[2px] w-8 bg-zinc-400/30 group-hover:bg-indigo-400 rounded" />
				</button>
			)}

			{/* 헤더 */}
			<div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2.5 mb-3 select-none shrink-0">
				<div className="flex items-center gap-2">
					{/* 드래그 도킹 핸들 (모바일에서는 미노출) */}
					{!isMobile && !onDockChange && (
						<button
							type="button"
							onMouseDown={handleDockDragStart}
							className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-655 dark:hover:text-zinc-200 cursor-grab active:cursor-grabbing transition border-0 bg-transparent"
							title="드래그하여 레이아웃 도킹 전환"
							aria-label="채팅 패널 위치 조절"
						>
							<GripVertical className="h-4 w-4 shrink-0" aria-hidden="true" />
						</button>
					)}

					<Sparkles className="h-4 w-4 text-indigo-500 shrink-0 animate-pulse" />
					<span className="text-xs font-bold dark:text-zinc-200 text-zinc-800 uppercase tracking-wider">
						AI 에디터
					</span>
					{isRunning && (
						<span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">
							<Loader2 className="h-2.5 w-2.5 animate-spin" />
							생각 중
						</span>
					)}
				</div>

				<div className="flex min-w-0 items-center gap-2">
					{onAgentTypeChange && (
						<div className="hidden items-center gap-1.5 sm:flex">
							<span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">
								Agent:
							</span>
							<select
								value={agentType}
								onChange={(e) => onAgentTypeChange(e.target.value)}
								className="text-[10px] rounded border border-zinc-250 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-0.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition cursor-pointer select-none"
							>
								<option value="gemini">Gemini</option>
								<option value="claude">Claude</option>
								<option value="cursor">Cursor</option>
								<option value="codex">Codex</option>
							</select>
						</div>
					)}

					{!isMobile && onDockChange && (
						<div className="flex rounded-md border dark:border-white/10 border-black/10 dark:bg-black/20 bg-black/5 p-0.5">
							<DockButton
								label="플로팅"
								active={chatDock === "floating"}
								onClick={() => onDockChange("floating")}
								icon={<MessageSquare className="h-3.5 w-3.5" />}
							/>
							<DockButton
								label="좌측 도크"
								active={chatDock === "left"}
								onClick={() => onDockChange("left")}
								icon={<PanelLeft className="h-3.5 w-3.5" />}
							/>
							<DockButton
								label="우측 도크"
								active={chatDock === "right"}
								onClick={() => onDockChange("right")}
								icon={<PanelRight className="h-3.5 w-3.5" />}
							/>
							<DockButton
								label="하단 도크"
								active={chatDock === "bottom"}
								onClick={() => onDockChange("bottom")}
								icon={<PanelBottom className="h-3.5 w-3.5" />}
							/>
						</div>
					)}

					{/* 레이아웃 전환 버튼 (모바일에서는 하단 고정 강제이므로 미노출) */}
					{!isMobile && onPositionChange && !onDockChange && (
						<button
							type="button"
							onClick={() =>
								onPositionChange(chatPosition === "side" ? "bottom" : "side")
							}
							className="p-1 rounded dark:hover:bg-white/5 hover:bg-black/5 dark:text-zinc-400 text-zinc-500 dark:hover:text-white hover:text-zinc-900 transition cursor-pointer"
							title={layoutToggleLabel}
							aria-label={layoutToggleLabel}
						>
							{chatPosition === "side" ? (
								<ArrowDownToLine className="h-3.5 w-3.5" />
							) : (
								<ArrowRightToLine className="h-3.5 w-3.5" />
							)}
						</button>
					)}

					{onOpenChange && (
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="p-1 rounded dark:hover:bg-white/5 hover:bg-black/5 dark:text-zinc-400 text-zinc-500 dark:hover:text-white hover:text-zinc-900 transition cursor-pointer"
							title="채팅 접기"
							aria-label="채팅 접기"
						>
							<Minimize2 className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>

			{/* 본문 콘텐츠 영역 */}
			{chatPosition === "bottom" ? (
				<div className="flex-1 grid lg:grid-cols-2 gap-4 min-h-0 min-w-0">
					{/* 좌측: 대화 히스토리 및 입력 창 */}
					<div className="flex flex-col h-full min-h-0 min-w-0 border-r border-zinc-200 dark:border-zinc-800/50 pr-4">
						<div
							ref={messagesContainerRef}
							className="flex-1 overflow-y-auto space-y-4 pr-1 mb-3 workbench-scrollbar text-xs leading-relaxed"
						>
							{renderMessages()}
						</div>
						{renderInputPanel()}
					</div>

					{/* 우측: 상시 노출 실시간 에이전트 로그 터미널 */}
					<div className="flex flex-col h-full min-h-0 min-w-0 bg-zinc-950 rounded-lg border dark:border-zinc-800 border-zinc-200 overflow-hidden shadow-inner">
						<div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold bg-zinc-900 dark:bg-black/50 text-zinc-400 border-b border-zinc-800 select-none">
							<Terminal className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
							<span>실시간 에이전트 생각 로그</span>
							{isRunning && (
								<span className="ml-auto h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
							)}
						</div>
						<div
							ref={setTerminalContainerRef}
							className="flex-1 p-3 font-mono text-[10px] leading-relaxed overflow-y-auto workbench-scrollbar select-text text-emerald-400 bg-black/40"
						>
							{history?.liveLog ? (
								<pre className="whitespace-pre-wrap break-all">
									{history.liveLog}
								</pre>
							) : (
								<div className="h-full flex flex-col items-center justify-center text-zinc-600 dark:text-zinc-500 italic select-none">
									<span>💡 실시간 실행 로그 대기 중...</span>
									<span className="text-[9px] mt-1">
										에이전트에게 질문하거나 편집 지시를 내리면 터미널 스트림이
										실시간 표시됩니다.
									</span>
								</div>
							)}
						</div>
					</div>
				</div>
			) : (
				<div className="flex-1 flex flex-col min-h-0 min-w-0">
					<div
						ref={messagesContainerRef}
						className="flex-1 overflow-y-auto space-y-4 pr-1 mb-3 workbench-scrollbar text-xs leading-relaxed"
					>
						{renderMessages()}
					</div>

					{/* 에이전트 진행 로그 터미널 (실시간 스트리밍 - 아코디언식 토글) */}
					{history?.liveLog && (
						<div className="mt-3 rounded-lg border dark:border-zinc-800 border-zinc-200 overflow-hidden shadow-md shrink-0">
							<button
								type="button"
								onClick={() => setShowTerminal(!showTerminal)}
								className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold dark:bg-zinc-950 bg-zinc-100 dark:text-zinc-400 text-zinc-600 dark:hover:text-zinc-200 hover:text-zinc-900 transition-colors select-none"
							>
								<Terminal className="h-3.5 w-3.5 text-blue-400" />
								<span>실시간 에이전트 생각 로그</span>
								{showTerminal ? (
									<ChevronUp className="h-3 w-3 ml-auto" />
								) : (
									<ChevronDown className="h-3 w-3 ml-auto" />
								)}
							</button>

							{showTerminal && (
								<pre
									ref={setTerminalContainerRef}
									className="p-3 bg-zinc-950 text-emerald-400 font-mono text-[9px] leading-relaxed max-h-[150px] overflow-y-auto workbench-scrollbar select-text"
								>
									{history.liveLog}
								</pre>
							)}
						</div>
					)}

					{renderInputPanel()}
				</div>
			)}

			{/* 드래그 도킹 Drop Zone 오버레이 */}
			{isDraggingDock && (
				<>
					{/* 하단 Drop Zone */}
					<div
						className={`fixed bottom-0 left-0 right-0 h-[140px] z-45 border-2 border-dashed flex flex-col items-center justify-center transition-all duration-200 pointer-events-none rounded-t-2xl backdrop-blur-xs ${
							activeDockTarget === "bottom"
								? "border-indigo-500 bg-indigo-500/15 text-indigo-400 shadow-[0_-5px_25px_rgba(99,102,241,0.25)] animate-pulse"
								: "border-zinc-400/30 bg-black/5 dark:bg-white/[0.02] text-zinc-500/40"
						}`}
					>
						<span className="text-xs font-bold tracking-wider">
							📥 여기에 드롭하여 하단에 고정
						</span>
					</div>

					{/* 우측 Drop Zone */}
					<div
						className={`fixed top-0 right-0 w-[200px] bottom-0 z-45 border-2 border-dashed flex flex-col items-center justify-center transition-all duration-200 pointer-events-none rounded-l-2xl backdrop-blur-xs ${
							activeDockTarget === "side"
								? "border-indigo-500 bg-indigo-500/15 text-indigo-400 shadow-[-5px_0_25px_rgba(99,102,241,0.25)] animate-pulse"
								: "border-zinc-400/30 bg-black/5 dark:bg-white/[0.02] text-zinc-500/40"
						}`}
					>
						<span className="text-xs font-bold tracking-wider rotate-90 whitespace-nowrap">
							📥 여기에 드롭하여 우측에 고정
						</span>
					</div>
				</>
			)}
		</div>
	);

	if (isDraggingDock && typeof document !== "undefined") {
		return (
			<>
				{/* Placeholder to reserve space and prevent layout collapsing */}
				<div
					style={
						chatPosition === "bottom"
							? { height: `${chatHeight}px` }
							: { height: "100%", minHeight: "500px" }
					}
					className="w-full rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-100/10 dark:bg-zinc-900/10 animate-pulse flex items-center justify-center text-xs text-zinc-400 select-none"
				>
					이동 중...
				</div>
				{createPortal(chatDOM, document.body)}
			</>
		);
	}

	return chatDOM;
}

function DockButton({
	label,
	active,
	icon,
	onClick,
}: {
	label: string;
	active: boolean;
	icon: ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`rounded p-1 transition ${
				active
					? "dark:bg-white/15 bg-white shadow-sm dark:text-white text-zinc-900"
					: "dark:text-zinc-400 text-zinc-500 dark:hover:text-white hover:text-zinc-900"
			}`}
			title={label}
			aria-label={label}
			aria-pressed={active}
		>
			{icon}
		</button>
	);
}
