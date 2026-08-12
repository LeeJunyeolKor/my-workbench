import { describe, expect, it } from "vitest";
import {
	CHAT_DOCK_STORAGE_KEY,
	CHAT_HEIGHT_STORAGE_KEY,
	CHAT_OPEN_STORAGE_KEY,
	CHAT_WIDTH_STORAGE_KEY,
	clampChatHeight,
	clampChatWidth,
	clampPlanSidebarWidth,
	DEFAULT_PLAN_SIDEBAR_WIDTH,
	PLAN_SIDEBAR_WIDTH_STORAGE_KEY,
	persistPlanChatLayoutPreferences,
	readPlanChatLayoutPreferences,
} from "./chat-layout-preferences";

describe("readPlanChatLayoutPreferences", () => {
	it("returns safe defaults when storage is unavailable, invalid, or blocked", () => {
		expect(readPlanChatLayoutPreferences(null)).toEqual({
			chatDock: "floating",
			chatHeight: 360,
			chatOpen: true,
			chatWidth: 360,
			planSidebarWidth: 300,
		});

		expect(
			readPlanChatLayoutPreferences({
				getItem: () => {
					throw new Error("storage blocked");
				},
			}),
		).toEqual({
			chatDock: "floating",
			chatHeight: 360,
			chatOpen: true,
			chatWidth: 360,
			planSidebarWidth: 300,
		});
	});

	it("reads a valid dock setting", () => {
		expect(
			readPlanChatLayoutPreferences({
				getItem: (key) => (key === CHAT_DOCK_STORAGE_KEY ? "left" : null),
			}).chatDock,
		).toBe("left");
	});

	it("clamps persisted panel dimensions", () => {
		expect(
			readPlanChatLayoutPreferences({
				getItem: (key) => {
					if (key === CHAT_WIDTH_STORAGE_KEY) return "9999";
					if (key === CHAT_HEIGHT_STORAGE_KEY) return "12";
					if (key === PLAN_SIDEBAR_WIDTH_STORAGE_KEY) return "9999";
					if (key === CHAT_OPEN_STORAGE_KEY) return "false";
					return null;
				},
			}),
		).toEqual({
			chatDock: "floating",
			chatHeight: 300,
			chatOpen: false,
			chatWidth: 640,
			planSidebarWidth: 440,
		});
	});
});

describe("plan chat layout clamping", () => {
	it("exports the default sidebar width used before storage hydration", () => {
		expect(DEFAULT_PLAN_SIDEBAR_WIDTH).toBe(300);
	});

	it("keeps chat and sidebar dimensions within UI bounds", () => {
		expect(clampChatWidth(12)).toBe(320);
		expect(clampChatWidth(9999)).toBe(640);
		expect(clampChatHeight(12)).toBe(300);
		expect(clampChatHeight(9999)).toBe(760);
		expect(clampPlanSidebarWidth(12)).toBe(260);
		expect(clampPlanSidebarWidth(9999)).toBe(440);
	});
});

describe("persistPlanChatLayoutPreferences", () => {
	it("stores only provided preferences and reports storage failures", () => {
		const writes: Record<string, string> = {};

		expect(
			persistPlanChatLayoutPreferences(
				{
					setItem: (key, value) => {
						writes[key] = value;
					},
				},
				{
					chatDock: "bottom",
					chatOpen: false,
					chatWidth: 9999,
					planSidebarWidth: 12,
				},
			),
		).toBe(true);
		expect(writes).toEqual({
			[CHAT_DOCK_STORAGE_KEY]: "bottom",
			[CHAT_OPEN_STORAGE_KEY]: "false",
			[CHAT_WIDTH_STORAGE_KEY]: "640",
			[PLAN_SIDEBAR_WIDTH_STORAGE_KEY]: "260",
		});

		expect(
			persistPlanChatLayoutPreferences(null, {
				chatOpen: true,
			}),
		).toBe(false);
	});
});
