import { cn } from "#/lib/cn";

export function surfaceClassName(className?: string) {
	return cn(
		"rounded-xl border border-[var(--workbench-border-soft)] bg-[var(--workbench-surface)] shadow-[var(--workbench-panel-shadow)] backdrop-blur-md",
		className,
	);
}
