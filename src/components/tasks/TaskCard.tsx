import { Pill } from "#/components/ui/Pill";
import { surfaceClassName } from "#/components/ui/surfaceClassName";
import { parseIssueTitle } from "#/lib/tasks/parse-issue-title";
import type { Task } from "#/lib/tasks/types";

type TaskCardProps = {
	task: Task;
	dragging?: boolean;
	onClick?: () => void;
};

export function TaskCard({ task, dragging = false, onClick }: TaskCardProps) {
	const parsed = parseIssueTitle(task.title);

	return (
		<article
			className={surfaceClassName(
				`group relative p-3.5 text-left transition-all duration-200 hover:-translate-y-[1px] ${
					dragging
						? "scale-[1.02] border-blue-500/40 bg-[var(--workbench-surface-strong)] shadow-[0_0_15px_rgba(59,130,246,0.3)] dark:border-blue-500/60"
						: "hover:border-blue-500/40 hover:shadow-[0_0_15px_rgba(59,130,246,0.25)] dark:hover:border-blue-500/40"
				}`,
			)}
			style={{
				opacity: dragging ? 0.85 : 1,
				rotate: dragging ? "-1deg" : undefined,
			}}
		>
			{onClick ? (
				<button
					type="button"
					className="absolute inset-0 rounded-xl cursor-pointer border-0 bg-transparent p-0"
					onClick={onClick}
					aria-label={`${parsed.issueKey ?? "작업"} 상세 열기`}
				/>
			) : null}
			<div className="relative z-10 pointer-events-none">
				{parsed.issueKey ? (
					<div className="mb-1.5 text-xs font-semibold dark:text-blue-400 text-blue-600 font-mono">
						{parsed.issueKey}
					</div>
				) : null}
				<p className="line-clamp-3 text-sm leading-snug font-medium dark:text-zinc-100 text-zinc-800">
					{parsed.issueKey ? parsed.summary : task.title}
				</p>
				{parsed.parentKey ? (
					<p className="mt-2 text-[11px] dark:text-zinc-500 text-zinc-400 font-mono">
						↑ {parsed.parentKey}
					</p>
				) : null}
				{task.note ? (
					<p className="mt-2 line-clamp-2 text-[13px] dark:text-zinc-400 text-zinc-500">
						{task.note}
					</p>
				) : null}
				{task.subtasks.length > 0 ? (
					<div className="mt-3.5">
						<Pill tone="blue" className="text-[11px] font-semibold font-mono">
							{task.subtasks.filter((subtask) => subtask.checked).length}/
							{task.subtasks.length} 하위 작업
						</Pill>
					</div>
				) : null}
			</div>
		</article>
	);
}
