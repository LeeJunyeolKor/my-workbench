type PlanFileLike = {
	filename: string;
};

export function orderPlanFiles<T extends PlanFileLike>(files: T[]): T[] {
	return [...files].sort((a, b) => {
		if (a.filename === "plan.md") return -1;
		if (b.filename === "plan.md") return 1;
		return a.filename.localeCompare(b.filename);
	});
}

export function filterVisiblePlanFiles<T extends PlanFileLike>(
	files: T[],
	showArchive: boolean,
): T[] {
	if (showArchive) return files;
	return files.filter((file) => !file.filename.startsWith("archive/"));
}
