export type PlanSummary = {
	taskId: string;
	title: string;
	progressDone: number;
	progressTotal: number;
	modifiedAt: string;
	accent: string;
	repo?: string;
	issueUrl?: string;
};

export type PlanTocEntry = {
	level: number;
	text: string;
	id: string;
};

export type PlanFile = {
	filename: string;
	title: string;
	content: string;
	html: string;
	toc: PlanTocEntry[];
	progressDone: number;
	progressTotal: number;
};

export type PlanDetail = {
	taskId: string;
	title: string;
	modifiedAt: string;
	accent: string;
	repo?: string;
	issueUrl?: string;
	files: PlanFile[];
};
