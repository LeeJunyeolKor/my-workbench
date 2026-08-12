import { useDroppable } from "@dnd-kit/core";
import { Pill } from "#/components/ui/Pill";
import { surfaceClassName } from "#/components/ui/surfaceClassName";
import { parseIssueTitle } from "#/lib/tasks/parse-issue-title";
import type { Task } from "#/lib/tasks/types";
import { DraggableTaskCard } from "./DraggableTaskCard";

type BoardColumnProps = {
	sectionId: string;
	title: string;
	accent: string;
	tasks: Task[];
	onSelectTask: (task: Task) => void;
};

export function BoardColumn({
	sectionId,
	title,
	accent,
	tasks,
	onSelectTask,
}: BoardColumnProps) {
	const { setNodeRef, isOver } = useDroppable({ id: sectionId });

	return (
		<section
			ref={setNodeRef}
			className={surfaceClassName(
				`flex max-h-full shrink-0 flex-col transition-all duration-300 ${
					isOver
						? "border-blue-500/40 bg-[var(--workbench-surface-strong)] shadow-[0_0_20px_rgba(59,130,246,0.15)] dark:border-blue-500/50"
						: ""
				}`,
			)}
			style={{
				width: "var(--workbench-list-width)",
			}}
		>
			<div className="flex items-center justify-between px-3.5 py-3 select-none">
				<div className="flex items-center gap-2">
					<span
						className="w-1.5 h-1.5 rounded-full"
						style={{ backgroundColor: accent }}
					/>
					<h2 className="text-sm font-bold dark:text-white text-zinc-800 tracking-wide">
						{title}
					</h2>
				</div>
				<Pill className="px-2 py-0.5 text-xs font-bold">{tasks.length}</Pill>
			</div>
			<div className="workbench-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-2 pb-3">
				{tasks.map((task) => (
					<DraggableTaskCard
						key={task.id}
						task={task}
						onSelect={() => onSelectTask(task)}
					/>
				))}
			</div>
		</section>
	);
}

export type ColumnCard = {
	issueKey: string;
	title: string;
	parent?: string;
	label?: { text: string; color: string };
};

export function taskToColumnCard(task: Task): ColumnCard {
	const parsed = parseIssueTitle(task.title);
	return {
		issueKey: parsed.issueKey ?? task.title.slice(0, 24),
		title: parsed.summary,
		parent: parsed.parentKey ?? undefined,
	};
}
