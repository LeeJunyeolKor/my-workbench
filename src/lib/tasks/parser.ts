import { DEFAULT_SECTIONS, taskSectionId } from "#/lib/tasks/columns";
import type { Task, TaskBoardData, TaskSection } from "#/lib/tasks/types";

let taskIdCounter = 0;

function nextTaskId(): string {
	taskIdCounter += 1;
	return `task-${Date.now()}-${taskIdCounter}`;
}

export function parseTaskMarkdown(content: string): TaskBoardData {
	const resultSections: TaskSection[] = [];
	const resultTasks: Record<string, Task[]> = {};
	let currentSectionId: string | null = null;
	let currentTask: Task | null = null;

	for (const line of content.split("\n")) {
		const headerMatch = line.match(/^## \*{0,2}(.+?)\*{0,2}$/);
		if (headerMatch) {
			if (currentTask && currentSectionId) {
				resultTasks[currentSectionId].push(currentTask);
				currentTask = null;
			}

			const sectionName = headerMatch[1].trim();
			currentSectionId = taskSectionId(sectionName);

			if (!resultTasks[currentSectionId]) {
				resultSections.push({ id: currentSectionId, name: sectionName });
				resultTasks[currentSectionId] = [];
			}
			continue;
		}

		if (currentSectionId && line.match(/^- \[[ xX]\]/)) {
			if (currentTask) {
				resultTasks[currentSectionId].push(currentTask);
			}

			const checked = line.match(/\[[xX]\]/) !== null;
			const text = line.replace(/^- \[[ xX]\]\s*/, "");
			let title = text;
			let note = "";

			const boldMatch = text.match(/^\*\*(.+?)\*\*(.*)$/);
			if (boldMatch) {
				title = boldMatch[1];
				note = boldMatch[2].replace(/^\s*-\s*/, "").trim();
			}

			currentTask = {
				id: nextTaskId(),
				title,
				note,
				checked,
				subtasks: [],
				section: currentSectionId,
			};
			continue;
		}

		if (currentTask && line.match(/^\s+- \[[ xX]\]/)) {
			const checked = line.match(/\[[xX]\]/) !== null;
			const text = line.replace(/^\s+- \[[ xX]\]\s*/, "");
			currentTask.subtasks.push({ text, checked });
		}
	}

	if (currentTask && currentSectionId) {
		resultTasks[currentSectionId].push(currentTask);
	}

	return normalizeBoard({ sections: resultSections, tasks: resultTasks });
}

export function tasksToMarkdown(board: TaskBoardData): string {
	let md = "# Tasks\n";

	for (const section of board.sections) {
		md += `\n## ${section.name}\n`;
		const sectionTasks = board.tasks[section.id] ?? [];

		for (const task of sectionTasks) {
			const checkbox = task.checked ? "[x]" : "[ ]";
			const note = task.note ? ` - ${task.note}` : "";
			md += `- ${checkbox} **${task.title}**${note}\n`;

			for (const subtask of task.subtasks) {
				const subCheckbox = subtask.checked ? "[x]" : "[ ]";
				md += `  - ${subCheckbox} ${subtask.text}\n`;
			}
		}

		if (sectionTasks.length === 0) {
			md += "\n";
		}
	}

	return `${md.trimEnd()}\n`;
}

export function emptyBoard(): TaskBoardData {
	return {
		sections: DEFAULT_SECTIONS.map(({ id, name }) => ({ id, name })),
		tasks: Object.fromEntries(DEFAULT_SECTIONS.map(({ id }) => [id, []])),
	};
}

function normalizeBoard(board: TaskBoardData): TaskBoardData {
	const sections = [...board.sections];
	const tasks = { ...board.tasks };

	for (const section of DEFAULT_SECTIONS) {
		if (!tasks[section.id]) {
			tasks[section.id] = [];
		}
		if (!sections.some((entry) => entry.id === section.id)) {
			sections.push({ id: section.id, name: section.name });
		}
	}

	const order = new Map<string, number>(
		DEFAULT_SECTIONS.map((section, index) => [section.id, index]),
	);
	const sectionOrder = (sectionId: string) => order.get(sectionId) ?? -1;
	sections.sort((a, b) => sectionOrder(a.id) - sectionOrder(b.id));

	return { sections, tasks };
}

export function moveTask(
	board: TaskBoardData,
	taskId: string,
	targetSectionId: string,
): TaskBoardData {
	let movedTask: Task | null = null;
	const tasks: Record<string, Task[]> = {};

	for (const [sectionId, sectionTasks] of Object.entries(board.tasks)) {
		tasks[sectionId] = [];
		for (const task of sectionTasks) {
			if (task.id === taskId) {
				movedTask = { ...task, section: targetSectionId };
			} else {
				tasks[sectionId].push(task);
			}
		}
	}

	if (!movedTask) return board;

	if (!tasks[targetSectionId]) {
		tasks[targetSectionId] = [];
	}
	tasks[targetSectionId].push(movedTask);

	return { ...board, tasks };
}

export function updateTask(board: TaskBoardData, updated: Task): TaskBoardData {
	const tasks = Object.fromEntries(
		Object.entries(board.tasks).map(([sectionId, sectionTasks]) => [
			sectionId,
			sectionTasks.filter((task) => task.id !== updated.id),
		]),
	);
	tasks[updated.section] = [...(tasks[updated.section] ?? []), updated];
	return { ...board, tasks };
}

export function addTask(board: TaskBoardData, task: Task): TaskBoardData {
	return {
		...board,
		tasks: {
			...board.tasks,
			[task.section]: [...(board.tasks[task.section] ?? []), task],
		},
	};
}

export function deleteTask(
	board: TaskBoardData,
	taskId: string,
): TaskBoardData {
	return {
		...board,
		tasks: Object.fromEntries(
			Object.entries(board.tasks).map(([sectionId, tasks]) => [
				sectionId,
				tasks.filter((task) => task.id !== taskId),
			]),
		),
	};
}
