import { DEFAULT_SECTIONS } from "#/lib/tasks/columns";
import type { Task, TaskBoardData } from "#/lib/tasks/types";
import { TaskCard } from "./TaskCard";

type TaskListViewProps = {
	board: TaskBoardData;
	onSelectTask: (task: Task) => void;
};

export function TaskListView({ board, onSelectTask }: TaskListViewProps) {
	return (
		<div className="workbench-scrollbar flex-1 overflow-y-auto px-4 pb-6">
			<div className="mx-auto max-w-3xl space-y-6">
				{board.sections.map((section) => {
					const tasks = board.tasks[section.id] ?? [];
					if (tasks.length === 0) return null;
					const accent =
						DEFAULT_SECTIONS.find((entry) => entry.id === section.id)?.accent ??
						"var(--workbench-accent-blue)";

					return (
						<section key={section.id}>
							<h2
								className="mb-3 text-sm font-bold uppercase tracking-wide dark:text-white/90 text-zinc-850"
								style={{
									borderLeft: `4px solid ${accent}`,
									paddingLeft: "0.75rem",
								}}
							>
								{section.name} ({tasks.length})
							</h2>
							<div className="space-y-2">
								{tasks.map((task) => (
									<TaskCard
										key={task.id}
										task={task}
										onClick={() => onSelectTask(task)}
									/>
								))}
							</div>
						</section>
					);
				})}
			</div>
		</div>
	);
}
