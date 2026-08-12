import { describe, expect, it } from "vitest";
import {
	planDocumentClassName,
	planSidebarPanelClassName,
	repoPillTone,
} from "./design-system-classnames";

describe("design-system class helpers", () => {
	it("keeps repeated surfaces and repository chips on shared primitives", () => {
		expect(planDocumentClassName("p-6")).toContain(
			"shadow-[var(--workbench-panel-shadow)]",
		);
		expect(planSidebarPanelClassName("p-3")).toContain("p-3");
		expect(repoPillTone("web-app")).toBe("blue");
		expect(repoPillTone("automation")).toBe("violet");
		expect(repoPillTone("unknown")).toBe("green");
	});
});
