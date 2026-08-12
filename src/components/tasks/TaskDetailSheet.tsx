import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseIssueTitle } from "#/lib/tasks/parse-issue-title";
import type { Task, TaskSection } from "#/lib/tasks/types";

type TaskDetailSheetProps = {
	task: Task | null;
	sections: TaskSection[];
	onClose: () => void;
	onUpdate: (task: Task) => void;
	onDelete: (taskId: string) => void;
};

export function TaskDetailSheet({
	task,
	sections,
	onClose,
	onUpdate,
	onDelete,
}: TaskDetailSheetProps) {
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const [draft, setDraft] = useState<Task | null>(task);

	useEffect(() => setDraft(task), [task]);

	useEffect(() => {
		if (!task) return;
		const previousActiveElement = document.activeElement as HTMLElement | null;
		const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};

		document.addEventListener("keydown", handleKeyDown);
		document.body.style.overflow = "hidden";
		return () => {
			window.clearTimeout(timer);
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "";
			previousActiveElement?.focus?.();
		};
	}, [task, onClose]);

	if (!task || !draft) return null;
	const parsed = parseIssueTitle(draft.title);

	return (
		<>
			<button
				type="button"
				aria-label="작업 상세 닫기"
				className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
				onClick={onClose}
			/>
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby="task-detail-title"
				className="fixed inset-x-3 top-[4.25rem] bottom-4 z-50 mx-auto flex w-auto max-w-3xl flex-col overflow-hidden rounded-lg border border-black/10 bg-white/95 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-950/95 sm:inset-x-6"
			>
				<header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4 dark:border-white/10">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							{parsed.issueKey ? (
								<span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-mono text-xs font-bold text-blue-650 dark:text-blue-300">
									{parsed.issueKey}
								</span>
							) : null}
							<span className="rounded-md border border-black/10 bg-black/5 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
								{sections.find((section) => section.id === draft.section)
									?.name ?? draft.section}
							</span>
						</div>
						<h2
							id="task-detail-title"
							className="mt-2 text-xl font-bold leading-snug text-zinc-950 dark:text-white"
						>
							{parsed.issueKey ? parsed.summary : draft.title}
						</h2>
						{parsed.parentKey ? (
							<p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
								상위 이슈 {parsed.parentKey}
							</p>
						) : null}
					</div>
					<button
						ref={closeButtonRef}
						type="button"
						onClick={onClose}
						className="rounded-md p-2 text-black/50 transition-colors hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
						aria-label="작업 상세 닫기"
					>
						<X className="h-5 w-5" />
					</button>
				</header>

				<div className="workbench-scrollbar flex-1 space-y-5 overflow-y-auto px-5 py-5">
					<label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
						제목
						<input
							value={draft.title}
							onChange={(event) =>
								setDraft({ ...draft, title: event.target.value })
							}
							className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
						/>
					</label>
					<label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
						메모
						<textarea
							value={draft.note}
							onChange={(event) =>
								setDraft({ ...draft, note: event.target.value })
							}
							className="mt-1 min-h-28 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
						/>
					</label>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
							상태
							<select
								value={draft.section}
								onChange={(event) =>
									setDraft({ ...draft, section: event.target.value })
								}
								className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
							>
								{sections.map((section) => (
									<option key={section.id} value={section.id}>
										{section.name}
									</option>
								))}
							</select>
						</label>
						<label className="mt-6 flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
							<input
								type="checkbox"
								checked={draft.checked}
								onChange={(event) =>
									setDraft({ ...draft, checked: event.target.checked })
								}
							/>
							작업 완료
						</label>
					</div>

					<section className="rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
								하위 작업
							</h3>
							<button
								type="button"
								onClick={() =>
									setDraft({
										...draft,
										subtasks: [
											...draft.subtasks,
											{ text: "새 하위 작업", checked: false },
										],
									})
								}
								className="inline-flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-xs font-semibold dark:border-white/10"
							>
								<Plus className="h-3.5 w-3.5" />
								추가
							</button>
						</div>
						{draft.subtasks.length === 0 ? (
							<p className="text-sm text-zinc-500 dark:text-zinc-400">
								하위 작업이 없습니다.
							</p>
						) : (
							<div className="space-y-2">
								{draft.subtasks.map((subtask, index) => (
									<div
										key={`${draft.id}-${subtask.text}-${subtask.checked ? "done" : "todo"}`}
										className="flex items-center gap-2"
									>
										<input
											type="checkbox"
											checked={subtask.checked}
											onChange={() =>
												setDraft({
													...draft,
													subtasks: draft.subtasks.map((entry, entryIndex) =>
														entryIndex === index
															? { ...entry, checked: !entry.checked }
															: entry,
													),
												})
											}
										/>
										<input
											value={subtask.text}
											onChange={(event) =>
												setDraft({
													...draft,
													subtasks: draft.subtasks.map((entry, entryIndex) =>
														entryIndex === index
															? { ...entry, text: event.target.value }
															: entry,
													),
												})
											}
											className="min-w-0 flex-1 rounded border border-black/10 bg-white px-2 py-1 text-sm text-zinc-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-black/40 dark:text-zinc-100"
										/>
										{subtask.checked ? (
											<CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
										) : null}
										<button
											type="button"
											aria-label="하위 작업 삭제"
											onClick={() =>
												setDraft({
													...draft,
													subtasks: draft.subtasks.filter(
														(_, entryIndex) => entryIndex !== index,
													),
												})
											}
											className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-600"
										>
											<Trash2 className="h-4 w-4" />
										</button>
									</div>
								))}
							</div>
						)}
					</section>
				</div>

				<footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-5 py-3 dark:border-white/10">
					<button
						type="button"
						onClick={() => {
							if (window.confirm("이 작업을 삭제할까요?")) onDelete(draft.id);
						}}
						className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10"
					>
						<Trash2 className="h-4 w-4" />
						삭제
					</button>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onClose}
							className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700"
						>
							취소
						</button>
						<button
							type="button"
							disabled={!draft.title.trim()}
							onClick={() =>
								onUpdate({
									...draft,
									title: draft.title.trim(),
									note: draft.note.trim(),
									subtasks: draft.subtasks
										.filter((entry) => entry.text.trim())
										.map((entry) => ({ ...entry, text: entry.text.trim() })),
								})
							}
							className="rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
							style={{
								background: "var(--workbench-btn-primary)",
								color: "var(--workbench-btn-primary-text)",
							}}
						>
							저장
						</button>
					</div>
				</footer>
			</section>
		</>
	);
}
