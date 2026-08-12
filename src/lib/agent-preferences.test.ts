import { describe, expect, it } from "vitest";
import {
	AGENT_TYPE_STORAGE_KEY,
	CURSOR_CLI_PATH_STORAGE_KEY,
	getAgentCliPath,
	persistAgentPreferences,
	readAgentPreferences,
} from "./agent-preferences";

describe("readAgentPreferences", () => {
	it("returns validated agent preferences from storage", () => {
		expect(
			readAgentPreferences({
				getItem: (key) => {
					if (key === AGENT_TYPE_STORAGE_KEY) return "cursor";
					if (key === CURSOR_CLI_PATH_STORAGE_KEY) return "custom-agent";
					return null;
				},
			}),
		).toEqual({
			agentType: "cursor",
			cursorCliPath: "custom-agent",
		});
	});

	it("falls back when storage is unavailable, invalid, or blocked", () => {
		expect(readAgentPreferences(null)).toEqual({
			agentType: "gemini",
			cursorCliPath: "agent",
		});
		expect(
			readAgentPreferences({
				getItem: (key) => (key === AGENT_TYPE_STORAGE_KEY ? "robot" : ""),
			}),
		).toEqual({
			agentType: "gemini",
			cursorCliPath: "agent",
		});
		expect(
			readAgentPreferences({
				getItem: () => {
					throw new Error("storage blocked");
				},
			}),
		).toEqual({
			agentType: "gemini",
			cursorCliPath: "agent",
		});
	});
});

describe("getAgentCliPath", () => {
	it("uses the Cursor CLI path only for the Cursor agent", () => {
		expect(
			getAgentCliPath({
				agentType: "cursor",
				cursorCliPath: "custom-agent",
			}),
		).toBe("custom-agent");
		expect(
			getAgentCliPath({
				agentType: "gemini",
				cursorCliPath: "custom-agent",
			}),
		).toBe("");
	});
});

describe("persistAgentPreferences", () => {
	it("reports whether preferences were stored", () => {
		const writes: Record<string, string> = {};

		expect(
			persistAgentPreferences(
				{
					setItem: (key, value) => {
						writes[key] = value;
					},
				},
				{
					agentType: "codex",
					cursorCliPath: "custom-agent",
				},
			),
		).toBe(true);
		expect(writes).toEqual({
			[AGENT_TYPE_STORAGE_KEY]: "codex",
			[CURSOR_CLI_PATH_STORAGE_KEY]: "custom-agent",
		});

		expect(
			persistAgentPreferences(null, {
				agentType: "claude",
			}),
		).toBe(false);
		expect(
			persistAgentPreferences(
				{
					setItem: () => {
						throw new Error("quota exceeded");
					},
				},
				{
					cursorCliPath: "agent",
				},
			),
		).toBe(false);
	});
});
