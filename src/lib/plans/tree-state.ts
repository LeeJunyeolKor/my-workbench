export type PlanTreeExpandMode = "auto" | "expanded" | "collapsed";

export function shouldExpandPlanFolder({
	folderPath,
	activePath,
	expandAllToken,
	treeMode = "auto",
}: {
	folderPath: string;
	activePath: string | undefined;
	expandAllToken?: number;
	treeMode?: PlanTreeExpandMode;
}) {
	if (treeMode === "expanded") return true;
	if (treeMode === "collapsed") return false;
	if ((expandAllToken ?? 0) > 0) return true;
	if (!activePath) return false;
	return activePath === folderPath || activePath.startsWith(`${folderPath}/`);
}
