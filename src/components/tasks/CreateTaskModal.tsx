import { useEffect, useState } from "react";
import { ModalSurface } from "#/components/ui/ModalSurface";
import type { Task, TaskSection } from "#/lib/tasks/types";

type CreateTaskModalProps = {
	isOpen: boolean;
	sections: TaskSection[];
	onClose: () => void;
	onCreate: (task: Task) => void;
};

export function CreateTaskModal({
	isOpen,
	sections,
	onClose,
	onCreate,
}: CreateTaskModalProps) {
	const [title, setTitle] = useState("");
	const [note, setNote] = useState("");
	const [section, setSection] = useState("");

	useEffect(() => {
		if (!isOpen) return;
		setTitle("");
		setNote("");
		setSection(
			sections.find((entry) => entry.id === "todo")?.id ??
				sections[0]?.id ??
				"todo",
		);
	}, [isOpen, sections]);

	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
			<ModalSurface className="max-w-lg">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						const trimmedTitle = title.trim();
						if (!trimmedTitle) return;
						onCreate({
							id: `task-${crypto.randomUUID()}`,
							title: trimmedTitle,
							note: note.trim(),
							checked: false,
							subtasks: [],
							section,
						});
						onClose();
					}}
				>
					<header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
						<div>
							<h2 className="text-lg font-bold text-zinc-900 dark:text-white">
								작업 추가
							</h2>
							<p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
								로컬 작업 보드에 저장합니다.
							</p>
						</div>
						<button
							type="button"
							onClick={onClose}
							aria-label="작업 추가 닫기"
							className="rounded-md p-2 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
						>
							×
						</button>
					</header>
					<div className="space-y-4 p-6">
						<label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
							제목
							<input
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
							/>
						</label>
						<label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
							메모
							<textarea
								value={note}
								onChange={(event) => setNote(event.target.value)}
								className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
							/>
						</label>
						<label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
							상태
							<select
								value={section}
								onChange={(event) => setSection(event.target.value)}
								className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
							>
								{sections.map((entry) => (
									<option key={entry.id} value={entry.id}>
										{entry.name}
									</option>
								))}
							</select>
						</label>
					</div>
					<footer className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
						<button
							type="button"
							onClick={onClose}
							className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700"
						>
							취소
						</button>
						<button
							type="submit"
							disabled={!title.trim()}
							className="rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
							style={{
								background: "var(--workbench-btn-primary)",
								color: "var(--workbench-btn-primary-text)",
							}}
						>
							추가
						</button>
					</footer>
				</form>
			</ModalSurface>
		</div>
	);
}
