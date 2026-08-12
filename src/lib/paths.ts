export const DEFAULT_WORKBENCH_DATA_PATH = "~/.my-workbench";

export function expandHomePath(input: string, homeDirectory: string): string {
	if (input === "~") return homeDirectory;
	if (!input.startsWith("~/")) return input;

	const homePrefix =
		homeDirectory === "/" ? "" : homeDirectory.replace(/\/+$/, "");
	return `${homePrefix}/${input.slice(2)}`;
}
