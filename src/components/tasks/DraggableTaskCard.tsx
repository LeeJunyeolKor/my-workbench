import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "#/lib/tasks/types";
import { TaskCard } from "./TaskCard";

type DraggableTaskCardProps = {
	task: Task;
	onSelect: () => void;
};

export function DraggableTaskCard({ task, onSelect }: DraggableTaskCardProps) {
	const { attributes, listeners, setNodeRef, transform, isDragging } =
		useDraggable({
			id: task.id,
		});

	const style = transform
		? { transform: CSS.Translate.toString(transform) }
		: undefined;

	return (
		<div ref={setNodeRef} style={style} {...listeners} {...attributes}>
			<TaskCard task={task} dragging={isDragging} onClick={onSelect} />
		</div>
	);
}
