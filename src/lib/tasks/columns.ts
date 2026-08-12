export const DEFAULT_SECTIONS = [
	{
		id: "in-progress",
		name: "진행 중",
		accent: "var(--workbench-accent-blue)",
	},
	{ id: "on-hold", name: "보류", accent: "var(--workbench-accent-yellow)" },
	{ id: "todo", name: "할 일", accent: "var(--workbench-accent-purple)" },
	{ id: "done", name: "완료", accent: "var(--workbench-accent-green)" },
] as const;

export const SECTION_NAME_BY_ID = Object.fromEntries(
	DEFAULT_SECTIONS.map((section) => [section.id, section.name]),
) as Record<string, string>;

const SECTION_ID_BY_NAME: Record<string, string> = {
	"진행 중": "in-progress",
	진행중: "in-progress",
	"in progress": "in-progress",
	doing: "in-progress",
	보류: "on-hold",
	"보류 중": "on-hold",
	보류중: "on-hold",
	"on hold": "on-hold",
	hold: "on-hold",
	"할 일": "todo",
	할일: "todo",
	todo: "todo",
	"to do": "todo",
	완료: "done",
	done: "done",
};

export function taskSectionId(name: string): string {
	const normalized = name.trim().toLowerCase();
	const mapped = SECTION_ID_BY_NAME[normalized];
	if (mapped) return mapped;

	const slug = normalized
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return slug || normalized;
}
