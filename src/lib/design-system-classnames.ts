import type { PillTone } from "#/components/ui/Pill";
import { surfaceClassName } from "#/components/ui/surfaceClassName";

export function repoPillTone(repoSlug: string): PillTone {
	if (repoSlug === "web-app") return "blue";
	if (repoSlug === "automation") return "violet";
	return "green";
}

export function planDocumentClassName(className?: string) {
	return surfaceClassName(`animate-in fade-in duration-150 ${className ?? ""}`);
}

export function planSidebarPanelClassName(className?: string) {
	return surfaceClassName(className);
}
