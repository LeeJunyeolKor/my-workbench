type PlanFileLike = {
	filename: string;
};

const FILE_ITEM_PREFIX = "file:";
const FOLDER_ITEM_PREFIX = "folder:";

function comparePlanFilename(a: string, b: string): number {
	if (a === "plan.md") return -1;
	if (b === "plan.md") return 1;
	return a.localeCompare(b);
}

export function orderPlanFiles<T extends PlanFileLike>(
	files: T[],
	savedOrder: string[] = [],
): T[] {
	const ordered = [...files].sort((a, b) =>
		comparePlanFilename(a.filename, b.filename),
	);
	if (savedOrder.length === 0) return ordered;

	const indexByFilename = new Map(
		savedOrder.map((filename, index) => [filename, index]),
	);

	return ordered.sort((a, b) => {
		const aIndex = indexByFilename.get(a.filename);
		const bIndex = indexByFilename.get(b.filename);

		if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
		if (aIndex !== undefined) return -1;
		if (bIndex !== undefined) return 1;
		return comparePlanFilename(a.filename, b.filename);
	});
}

export function filterVisiblePlanFiles<T extends PlanFileLike>(
	files: T[],
	showArchive: boolean,
): T[] {
	if (showArchive) return files;
	return files.filter((file) => !file.filename.startsWith("archive/"));
}

export function movePlanFileOrder(
	filenames: string[],
	filename: string,
	direction: "up" | "down",
): string[] {
	const index = filenames.indexOf(filename);
	if (index === -1) return filenames;

	const nextIndex = direction === "up" ? index - 1 : index + 1;
	if (nextIndex < 0 || nextIndex >= filenames.length) return filenames;

	const next = [...filenames];
	const [entry] = next.splice(index, 1);
	next.splice(nextIndex, 0, entry);
	return next;
}

export function reorderPlanFilesByDrag(
	filenames: string[],
	activeFilename: string,
	overFilename: string,
): string[] {
	const activeIndex = filenames.indexOf(activeFilename);
	const overIndex = filenames.indexOf(overFilename);
	if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
		return filenames;
	}

	const next = [...filenames];
	const [entry] = next.splice(activeIndex, 1);
	next.splice(overIndex, 0, entry);
	return next;
}

export function planFileTreeItemId(
	type: "file" | "folder",
	path: string,
): string {
	return `${type === "file" ? FILE_ITEM_PREFIX : FOLDER_ITEM_PREFIX}${path}`;
}

export function getPlanFileTreeItemIds(filenames: string[]): string[] {
	const ids: string[] = [];
	const seenFolders = new Set<string>();

	for (const filename of filenames) {
		const parts = filename.split("/");
		for (let index = 0; index < parts.length - 1; index++) {
			const folderPath = parts.slice(0, index + 1).join("/");
			if (!seenFolders.has(folderPath)) {
				seenFolders.add(folderPath);
				ids.push(planFileTreeItemId("folder", folderPath));
			}
		}
		ids.push(planFileTreeItemId("file", filename));
	}

	return ids;
}

function getDraggedPlanFiles(filenames: string[], itemId: string): string[] {
	if (itemId.startsWith(FOLDER_ITEM_PREFIX)) {
		const folderPath = itemId.slice(FOLDER_ITEM_PREFIX.length);
		return filenames.filter((filename) =>
			filename.startsWith(`${folderPath}/`),
		);
	}

	const filename = itemId.startsWith(FILE_ITEM_PREFIX)
		? itemId.slice(FILE_ITEM_PREFIX.length)
		: itemId;
	return filenames.includes(filename) ? [filename] : [];
}

export function reorderPlanFileTreeItemsByDrag(
	filenames: string[],
	activeItemId: string,
	overItemId: string,
): string[] {
	const activeFilenames = getDraggedPlanFiles(filenames, activeItemId);
	const overFilenames = getDraggedPlanFiles(filenames, overItemId);
	if (activeFilenames.length === 0 || overFilenames.length === 0) {
		return filenames;
	}

	const activeSet = new Set(activeFilenames);
	if (overFilenames.some((filename) => activeSet.has(filename))) {
		return filenames;
	}

	const activeIndex = filenames.findIndex((filename) =>
		activeSet.has(filename),
	);
	const overIndex = filenames.findIndex((filename) =>
		overFilenames.includes(filename),
	);
	if (activeIndex === -1 || overIndex === -1) return filenames;

	const remaining = filenames.filter((filename) => !activeSet.has(filename));
	const overIndexes = overFilenames
		.map((filename) => remaining.indexOf(filename))
		.filter((index) => index !== -1);
	if (overIndexes.length === 0) return filenames;

	const insertIndex =
		activeIndex < overIndex
			? Math.max(...overIndexes) + 1
			: Math.min(...overIndexes);
	const next = [
		...remaining.slice(0, insertIndex),
		...activeFilenames,
		...remaining.slice(insertIndex),
	];

	return next.every((filename, index) => filename === filenames[index])
		? filenames
		: next;
}
