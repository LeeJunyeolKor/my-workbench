type ViewMode = "board" | "list";

type BoardHeaderProps = {
	title: string;
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	onCreateTask: () => void;
	statusMessage?: string | null;
	saving?: boolean;
	readOnly?: boolean;
};

export function BoardHeader({
	title,
	viewMode,
	onViewModeChange,
	onCreateTask,
	statusMessage,
	saving = false,
	readOnly = false,
}: BoardHeaderProps) {
	return (
		<div className="flex shrink-0 flex-wrap items-center justify-between gap-4 px-4 pb-3 pt-4">
			<div className="min-w-0">
				<h1 className="truncate text-xl font-bold dark:text-white text-zinc-900 drop-shadow-sm">
					{title}
				</h1>
				<p className="text-sm dark:text-zinc-300 text-zinc-650">
					{readOnly
						? "로컬 작업 · 읽기 전용"
						: "로컬 작업 · 드래그하여 진행 상태 변경"}
					{saving ? " · 저장 중…" : null}
					{statusMessage ? ` · ${statusMessage}` : null}
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<div className="flex rounded-lg p-0.5 dark:bg-black/25 bg-black/5 border dark:border-white/5 border-black/5 backdrop-blur-md">
					{(["board", "list"] as const).map((mode) => (
						<button
							key={mode}
							type="button"
							onClick={() => onViewModeChange(mode)}
							className={`rounded px-3 py-1.5 text-sm font-semibold capitalize transition-all duration-200 ${
								viewMode === mode
									? "dark:bg-white/15 bg-white shadow-sm dark:text-white text-zinc-900 border dark:border-white/5 border-black/5"
									: "dark:text-zinc-400 text-zinc-600 hover:dark:text-white hover:text-zinc-900"
							}`}
						>
							{mode === "board" ? "보드" : "리스트"}
						</button>
					))}
				</div>
				<button
					type="button"
					onClick={onCreateTask}
					disabled={readOnly}
					className="rounded-md px-3 py-1.5 text-sm font-semibold transition border bg-zinc-150 hover:bg-zinc-200 border-zinc-350 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-950 dark:text-zinc-50 dark:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					작업 추가
				</button>
			</div>
		</div>
	);
}
