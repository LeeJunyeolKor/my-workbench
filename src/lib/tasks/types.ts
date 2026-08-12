export type Subtask = {
	text: string;
	checked: boolean;
};

export type Task = {
	id: string;
	title: string;
	note: string;
	checked: boolean;
	subtasks: Subtask[];
	section: string;
};

export type TaskSection = {
	id: string;
	name: string;
};

export type TaskBoardData = {
	sections: TaskSection[];
	tasks: Record<string, Task[]>;
};
