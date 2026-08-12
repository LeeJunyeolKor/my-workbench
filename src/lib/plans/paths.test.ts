import { describe, expect, it } from "vitest";
import { isValidTaskId } from "./paths";

describe("plan path task id validation", () => {
	it("accepts task ids and slugs with at least one alphanumeric character", () => {
		expect(isValidTaskId("DEMO-101")).toBe(true);
		expect(isValidTaskId("workbench-agent-session-search")).toBe(true);
		expect(isValidTaskId("plan.v2_draft")).toBe(true);
	});

	it("rejects path marker ids without alphanumeric content", () => {
		expect(isValidTaskId(".")).toBe(false);
		expect(isValidTaskId("..")).toBe(false);
		expect(isValidTaskId("---")).toBe(false);
		expect(isValidTaskId("__")).toBe(false);
	});
});
