import { useNavigate } from "@tanstack/react-router";
import {
	CheckSquare,
	CornerDownLeft,
	GitBranch,
	Loader2,
	Search,
	Sparkles,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "#/server/search";
import { globalSearch } from "#/server/search";

type CommandPaletteProps = {
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
};

export function CommandPalette({ isOpen, onOpenChange }: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [activeFilter, setActiveFilter] = useState<
		"all" | "worktree" | "plan" | "task"
	>("all");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const navigate = useNavigate();
	const inputRef = useRef<HTMLInputElement>(null);
	const resultsRef = useRef<HTMLDivElement>(null);

	// 1. 모달 열릴 때 포커스 및 초기화
	useEffect(() => {
		if (isOpen) {
			setQuery("");
			setResults([]);
			setActiveFilter("all");
			setErrorMessage(null);
			setSelectedIndex(0);
			setTimeout(() => inputRef.current?.focus(), 50);
			document.body.style.overflow = "hidden"; // 스크롤 방지
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	// 2. 디바운스 기반 검색 수행
	useEffect(() => {
		let active = true;

		if (!query.trim()) {
			setResults([]);
			setErrorMessage(null);
			setLoading(false);
			return;
		}

		setErrorMessage(null);
		setLoading(true);
		const timer = setTimeout(async () => {
			try {
				const searchResults = await globalSearch({ data: { query } });
				if (!active) return;
				setResults(searchResults);
				setSelectedIndex(0);
			} catch (err) {
				if (active) {
					console.error("Command palette search failed:", err);
					setResults([]);
					setErrorMessage(
						"검색 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
					);
				}
			} finally {
				if (active) {
					setLoading(false);
				}
			}
		}, 250);

		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [query]);

	// 3. 키보드 탐색 및 선택
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onOpenChange(false);
			return;
		}

		// Tab / Shift+Tab을 이용해 필터 변경
		if (e.key === "Tab") {
			e.preventDefault();
			const filters: ("all" | "worktree" | "plan" | "task")[] = [
				"all",
				"worktree",
				"plan",
				"task",
			];
			const currentIndex = filters.indexOf(activeFilter);
			const nextIndex = e.shiftKey
				? (currentIndex - 1 + filters.length) % filters.length
				: (currentIndex + 1) % filters.length;
			setActiveFilter(filters[nextIndex]);
			setSelectedIndex(0);
			return;
		}

		if (filteredResults.length === 0) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelectedIndex((prev) => (prev + 1) % filteredResults.length);
			scrollActiveIntoView();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelectedIndex(
				(prev) => (prev - 1 + filteredResults.length) % filteredResults.length,
			);
			scrollActiveIntoView();
		} else if (e.key === "Enter") {
			e.preventDefault();
			handleSelect(filteredResults[selectedIndex]);
		}
	};

	const handleSelect = (item: SearchResult) => {
		onOpenChange(false);
		navigate({ to: item.url });
	};

	// 선택된 항목이 스크롤 영역 밖이면 스크롤
	const scrollActiveIntoView = () => {
		setTimeout(() => {
			const activeEl = resultsRef.current?.querySelector(
				'[data-active="true"]',
			);
			if (activeEl) {
				activeEl.scrollIntoView({ block: "nearest" });
			}
		}, 10);
	};

	const filteredResults =
		activeFilter === "all"
			? results
			: results.filter((item) => item.type === activeFilter);

	if (!isOpen) return null;

	// 아이콘 매퍼
	const getIcon = (type: SearchResult["type"]) => {
		switch (type) {
			case "worktree":
				return <GitBranch className="h-4 w-4 text-blue-400" />;
			case "plan":
				return <Sparkles className="h-4 w-4 text-purple-400" />;
			case "task":
				return <CheckSquare className="h-4 w-4 text-emerald-400" />;
		}
	};

	const getBadgeClass = (type: SearchResult["type"]) => {
		switch (type) {
			case "worktree":
				return "bg-blue-500/10 text-blue-400 border-blue-500/20";
			case "plan":
				return "bg-purple-500/10 text-purple-400 border-purple-500/20";
			case "task":
				return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
		}
	};

	const getTypeLabel = (type: SearchResult["type"]) => {
		switch (type) {
			case "worktree":
				return "워크트리";
			case "plan":
				return "계획";
			case "task":
				return "작업";
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-[15vh]">
			<button
				type="button"
				aria-hidden="true"
				className="absolute inset-0 cursor-default"
				onClick={() => onOpenChange(false)}
				tabIndex={-1}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="통합 검색"
				className="relative w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl transition-all duration-300 animate-in fade-in zoom-in-95 dark:bg-zinc-900/95 bg-white/95 backdrop-blur-2xl"
				style={{
					borderColor: "var(--workbench-nav-border)",
				}}
				onKeyDown={handleKeyDown}
			>
				{/* 인풋 영역 */}
				<div
					className="relative flex items-center border-b px-4"
					style={{ borderColor: "var(--workbench-nav-border)" }}
				>
					<Search className="h-5 w-5 dark:text-zinc-400 text-zinc-500 shrink-0" />
					<input
						ref={inputRef}
						type="text"
						placeholder="작업, 계획, 워크트리 검색"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="w-full bg-transparent py-4 pl-3 pr-24 text-sm font-medium outline-none dark:text-white text-zinc-900 dark:placeholder-white/40 placeholder-zinc-400"
					/>
					<div className="absolute right-4 flex items-center gap-1.5">
						{loading && (
							<Loader2 className="h-4 w-4 animate-spin dark:text-white/40 text-zinc-400" />
						)}
						{query && (
							<button
								type="button"
								onClick={() => setQuery("")}
								className="p-1 rounded-md dark:hover:bg-white/5 hover:bg-black/5 dark:text-white/40 text-zinc-400 dark:hover:text-white hover:text-zinc-800 transition"
								title="검색어 지우기"
								aria-label="검색어 지우기"
							>
								<span className="text-[10px] px-1 py-0.5 rounded dark:bg-white/10 bg-black/5">
									지우기
								</span>
							</button>
						)}
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="p-1 rounded-md dark:hover:bg-white/5 hover:bg-black/5 dark:text-white/40 text-zinc-400 dark:hover:text-white hover:text-zinc-800 transition"
							title="검색 닫기"
							aria-label="검색 닫기"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>

				{/* 필터 칩 영역 */}
				<div
					className="flex items-center gap-1.5 px-4 py-2 border-b"
					style={{
						borderColor: "var(--workbench-nav-border)",
						background: "rgba(255,255,255,0.015)",
					}}
				>
					{(["all", "worktree", "plan", "task"] as const).map((f) => {
						const isActive = activeFilter === f;
						return (
							<button
								type="button"
								key={f}
								onClick={() => {
									setActiveFilter(f);
									setSelectedIndex(0);
									inputRef.current?.focus();
								}}
								className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border transition cursor-pointer select-none ${
									isActive
										? "dark:bg-white/15 bg-black/10 dark:text-white text-zinc-900 dark:border-white/20 border-black/15"
										: "bg-transparent dark:text-white/40 text-zinc-500 border-transparent hover:dark:text-white/60 hover:text-zinc-800 hover:dark:bg-white/5 hover:bg-black/5"
								}`}
							>
								{f === "all"
									? "전체"
									: f === "worktree"
										? "워크트리"
										: f === "plan"
											? "계획"
											: "작업"}
							</button>
						);
					})}
				</div>

				{/* 결과 리스트 영역 */}
				<div
					ref={resultsRef}
					className="max-h-[350px] overflow-y-auto p-2 space-y-1 workbench-scrollbar"
				>
					{filteredResults.length > 0 ? (
						<div
							className={`space-y-1 transition-opacity duration-200 ${loading ? "opacity-50 pointer-events-none" : ""}`}
						>
							{filteredResults.map((item, idx) => {
								const isActive = idx === selectedIndex;
								return (
									<button
										type="button"
										key={`${item.type}-${item.id}`}
										data-active={isActive}
										onClick={() => handleSelect(item)}
										className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 cursor-pointer select-none transition duration-150 text-left ${
											isActive
												? "dark:bg-white/10 bg-black/5 dark:text-white text-zinc-900"
												: "dark:text-white/70 text-zinc-650 hover:dark:bg-white/5 hover:bg-black/5 hover:dark:text-white hover:text-zinc-900"
										}`}
									>
										<div className="flex items-center gap-3 min-w-0">
											<div className="shrink-0">{getIcon(item.type)}</div>
											<div className="min-w-0 flex flex-col">
												<span className="text-sm font-semibold truncate">
													{item.title}
												</span>
												<span className="text-[11px] opacity-60 truncate mt-0.5">
													{item.subtitle}
												</span>
											</div>
										</div>

										<div className="flex items-center gap-2 shrink-0 ml-4">
											<span
												className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getBadgeClass(item.type)}`}
											>
												{getTypeLabel(item.type)}
											</span>
											{isActive && (
												<span className="opacity-40 flex items-center gap-0.5 text-[10px] font-mono">
													열기
													<CornerDownLeft className="h-3 w-3" />
												</span>
											)}
										</div>
									</button>
								);
							})}
						</div>
					) : loading ? (
						<div className="py-8 flex flex-col items-center justify-center gap-2 text-sm dark:text-white/40 text-zinc-500 font-medium">
							<Loader2 className="h-5 w-5 animate-spin dark:text-white/40 text-zinc-400" />
							<span>"{query}" 검색 중...</span>
						</div>
					) : errorMessage ? (
						<div className="py-8 text-center text-sm text-red-600 dark:text-red-400 font-medium">
							{errorMessage}
						</div>
					) : query.trim() ? (
						<div className="py-8 text-center text-sm dark:text-white/40 text-zinc-500 font-medium">
							"{query}"에 대한 결과가 없습니다.
							{activeFilter !== "all" ? " 현재 필터를 바꿔보세요." : ""}
						</div>
					) : (
						<div className="py-8 text-center text-xs dark:text-white/30 text-zinc-450 font-medium space-y-1">
							<p>보드, 계획, 워크트리에서 검색어를 입력하세요.</p>
							<p className="opacity-60 text-[10px]">
								방향키로 이동하고 Enter로 열 수 있습니다. Esc로 닫습니다.
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
