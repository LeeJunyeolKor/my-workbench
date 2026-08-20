import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { AlertCircle, ListPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "#/lib/errors";
import { saveTaskBoard } from "#/lib/local-data-ipc";
import { DEFAULT_SECTIONS } from "#/lib/tasks/columns";
import { addTask, deleteTask, moveTask, updateTask } from "#/lib/tasks/parser";
import { createTaskBoardSaveQueue } from "#/lib/tasks/save-queue";
import type { Task, TaskBoardData } from "#/lib/tasks/types";
import { BoardColumn } from "./BoardColumn";
import { BoardHeader } from "./BoardHeader";
import { CreateTaskModal } from "./CreateTaskModal";
import { TaskCard } from "./TaskCard";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { TaskListView } from "./TaskListView";

type ViewMode = "board" | "list";

type TaskBoardProps = {
	initialBoard: TaskBoardData;
	initialContent: string | null;
	readOnlyReason?: string | null;
};

export function TaskBoard({
	initialBoard,
	initialContent,
	readOnlyReason,
}: TaskBoardProps) {
	const [board, setBoard] = useState(initialBoard);
	const [viewMode, setViewMode] = useState<ViewMode>("board");
	const [selectedTask, setSelectedTask] = useState<Task | null>(null);
	const [activeTask, setActiveTask] = useState<Task | null>(null);
	const [saving, setSaving] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [dndReady, setDndReady] = useState(false);
	const pendingSaveCount = useRef(0);
	const enqueueSave = useRef(
		createTaskBoardSaveQueue(saveTaskBoard, initialContent),
	);
	const isReadOnly = Boolean(readOnlyReason);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	useEffect(() => setDndReady(true), []);

	const allTasks = useMemo(
		() => board.sections.flatMap((section) => board.tasks[section.id] ?? []),
		[board],
	);

	const scheduleSave = useCallback((nextBoard: TaskBoardData) => {
		pendingSaveCount.current += 1;
		setSaving(true);
		void enqueueSave
			.current(nextBoard)
			.then(() => setStatusMessage("저장됨"))
			.catch((error) => setStatusMessage(getErrorMessage(error, "저장 실패")))
			.finally(() => {
				pendingSaveCount.current -= 1;
				if (pendingSaveCount.current === 0) setSaving(false);
			});
	}, []);

	const commitBoard = useCallback(
		(nextBoard: TaskBoardData) => {
			if (isReadOnly) return;
			setBoard(nextBoard);
			scheduleSave(nextBoard);
		},
		[isReadOnly, scheduleSave],
	);

	const handleDragEnd = (event: DragEndEvent) => {
		setActiveTask(null);
		if (!event.over) return;
		const taskId = String(event.active.id);
		const targetSectionId = String(event.over.id);
		const task = allTasks.find((entry) => entry.id === taskId);
		if (!task || task.section === targetSectionId) return;
		commitBoard(moveTask(board, taskId, targetSectionId));
	};

	return (
		<div className="flex h-[calc(100vh-3rem)] flex-col">
			<BoardHeader
				title="내 작업 보드"
				viewMode={viewMode}
				onViewModeChange={setViewMode}
				onCreateTask={() => setCreateModalOpen(true)}
				statusMessage={statusMessage}
				saving={saving}
				readOnly={isReadOnly}
			/>

			{readOnlyReason ? (
				<output className="mx-4 mb-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
					<AlertCircle className="h-4 w-4 shrink-0" />
					{readOnlyReason}
				</output>
			) : null}

			{allTasks.length === 0 ? (
				<TaskEmptyState
					onCreate={() => setCreateModalOpen(true)}
					readOnly={isReadOnly}
				/>
			) : viewMode === "list" ? (
				<TaskListView board={board} onSelectTask={setSelectedTask} />
			) : dndReady && !isReadOnly ? (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCorners}
					onDragStart={(event: DragStartEvent) =>
						setActiveTask(
							allTasks.find((task) => task.id === event.active.id) ?? null,
						)
					}
					onDragEnd={handleDragEnd}
				>
					<div className="workbench-scrollbar flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4">
						{board.sections.map((section) => (
							<BoardColumn
								key={section.id}
								sectionId={section.id}
								title={section.name}
								accent={sectionAccent(section.id)}
								tasks={board.tasks[section.id] ?? []}
								onSelectTask={setSelectedTask}
							/>
						))}
					</div>
					<DragOverlay>
						{activeTask ? <TaskCard task={activeTask} dragging /> : null}
					</DragOverlay>
				</DndContext>
			) : (
				<StaticBoardColumns board={board} onSelectTask={setSelectedTask} />
			)}

			<TaskDetailSheet
				task={selectedTask}
				sections={board.sections}
				onClose={() => setSelectedTask(null)}
				onUpdate={(updated) => {
					commitBoard(updateTask(board, updated));
					setSelectedTask(updated);
				}}
				onDelete={(taskId) => {
					commitBoard(deleteTask(board, taskId));
					setSelectedTask(null);
				}}
				readOnlyReason={readOnlyReason}
			/>
			<CreateTaskModal
				isOpen={createModalOpen}
				sections={board.sections}
				onClose={() => setCreateModalOpen(false)}
				onCreate={(task) => commitBoard(addTask(board, task))}
				readOnlyReason={readOnlyReason}
			/>
		</div>
	);
}

function sectionAccent(sectionId: string): string {
	return (
		DEFAULT_SECTIONS.find((section) => section.id === sectionId)?.accent ??
		"var(--workbench-accent-blue)"
	);
}

function StaticBoardColumns({
	board,
	onSelectTask,
}: {
	board: TaskBoardData;
	onSelectTask: (task: Task) => void;
}) {
	return (
		<div className="workbench-scrollbar flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4">
			{board.sections.map((section) => {
				const tasks = board.tasks[section.id] ?? [];
				return (
					<section
						key={section.id}
						className="flex max-h-full shrink-0 flex-col rounded-xl border border-black/5 bg-white/45 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/85"
						style={{ width: "var(--workbench-list-width)" }}
					>
						<div className="flex items-center justify-between px-3.5 py-3">
							<div className="flex items-center gap-2">
								<span
									className="h-1.5 w-1.5 rounded-full"
									style={{ backgroundColor: sectionAccent(section.id) }}
								/>
								<h2 className="text-sm font-bold text-zinc-800 dark:text-white">
									{section.name}
								</h2>
							</div>
							<span className="text-xs font-bold text-zinc-500">
								{tasks.length}
							</span>
						</div>
						<div className="workbench-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-2 pb-3">
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
	);
}

function TaskEmptyState({
	onCreate,
	readOnly,
}: {
	onCreate: () => void;
	readOnly: boolean;
}) {
	return (
		<div className="flex flex-1 items-center justify-center px-4 pb-8">
			<div className="w-full max-w-xl rounded-lg border border-black/10 bg-white/80 p-6 text-center shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/70">
				<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/5">
					<ListPlus className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
				</div>
				<h2 className="mt-4 text-base font-bold text-zinc-900 dark:text-white">
					첫 작업을 추가하세요
				</h2>
				<p className="mt-2 text-sm text-zinc-550 dark:text-zinc-400">
					작업은 로컬 TASKS.md 파일에 저장됩니다.
				</p>
				<button
					type="button"
					onClick={onCreate}
					disabled={readOnly}
					className="mt-5 rounded-md px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
					style={{
						background: "var(--workbench-btn-primary)",
						color: "var(--workbench-btn-primary-text)",
					}}
				>
					작업 추가
				</button>
			</div>
		</div>
	);
}
