import { describe, expect, it } from "vitest";
import {
	clampPlanSidebarWidth,
	DEFAULT_PLAN_SIDEBAR_WIDTH,
	PLAN_SIDEBAR_WIDTH_STORAGE_KEY,
	persistPlanSidebarWidth,
	readPlanSidebarWidth,
} from "./sidebar-preferences";

describe("plan sidebar preferences", () => {
	it("uses the default width when storage is unavailable, invalid, or blocked", () => {
		expect(readPlanSidebarWidth(null)).toBe(DEFAULT_PLAN_SIDEBAR_WIDTH);
		expect(readPlanSidebarWidth({ getItem: () => "invalid" })).toBe(
			DEFAULT_PLAN_SIDEBAR_WIDTH,
		);
		expect(
			readPlanSidebarWidth({
				getItem: () => {
					throw new Error("storage blocked");
				},
			}),
		).toBe(DEFAULT_PLAN_SIDEBAR_WIDTH);
	});

	it("clamps stored and requested widths", () => {
		expect(clampPlanSidebarWidth(12)).toBe(260);
		expect(clampPlanSidebarWidth(9999)).toBe(440);
		expect(readPlanSidebarWidth({ getItem: () => "9999" })).toBe(440);
	});

	it("persists only the clamped sidebar width", () => {
		const writes: Record<string, string> = {};
		expect(
			persistPlanSidebarWidth(
				{ setItem: (key, value) => (writes[key] = value) },
				12,
			),
		).toBe(true);
		expect(writes).toEqual({ [PLAN_SIDEBAR_WIDTH_STORAGE_KEY]: "260" });
		expect(persistPlanSidebarWidth(null, 300)).toBe(false);
	});
});
