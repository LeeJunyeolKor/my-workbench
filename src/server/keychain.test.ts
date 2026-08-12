import { describe, expect, it } from "vitest";
import {
	getKeychainIdentity,
	keychainErrorMessage,
	parseApiKeyAgentInput,
	parseApiKeySaveInput,
} from "./keychain";

describe("getKeychainIdentity", () => {
	it("uses the My Workbench keychain namespace", () => {
		expect(getKeychainIdentity("codex")).toEqual({
			account: "MyWorkbenchAI",
			service: "my_workbench_codex_api_key",
		});
	});
});

describe("keychainErrorMessage", () => {
	it("uses Error.message when available", () => {
		expect(keychainErrorMessage(new Error("security command failed"))).toBe(
			"security command failed",
		);
	});

	it("keeps string errors readable", () => {
		expect(keychainErrorMessage("permission denied")).toBe("permission denied");
	});

	it("falls back to String conversion", () => {
		expect(keychainErrorMessage(null)).toBe("null");
	});
});

describe("parseApiKeySaveInput", () => {
	it("trims a supported agent type and API key", () => {
		expect(
			parseApiKeySaveInput({
				agentType: " codex ",
				apiKey: " sk-test ",
			}),
		).toEqual({
			agentType: "codex",
			apiKey: "sk-test",
		});
	});

	it("rejects unsupported keychain targets", () => {
		expect(() =>
			parseApiKeySaveInput({
				agentType: "cursor",
				apiKey: "sk-test",
			}),
		).toThrow("지원하지 않는 API Key 대상입니다.");
	});

	it("rejects empty API keys", () => {
		expect(() =>
			parseApiKeySaveInput({
				agentType: "gemini",
				apiKey: "  ",
			}),
		).toThrow("API Key가 입력되지 않았습니다.");
	});

	it("rejects malformed input", () => {
		expect(() => parseApiKeySaveInput(null)).toThrow(
			"API Key 입력 형식이 올바르지 않습니다.",
		);
	});
});

describe("parseApiKeyAgentInput", () => {
	it("trims a supported agent type", () => {
		expect(parseApiKeyAgentInput({ agentType: " claude " })).toEqual({
			agentType: "claude",
		});
	});

	it("rejects unsupported keychain targets", () => {
		expect(() => parseApiKeyAgentInput({ agentType: "vim" })).toThrow(
			"지원하지 않는 API Key 대상입니다.",
		);
	});

	it("rejects malformed input", () => {
		expect(() => parseApiKeyAgentInput("codex")).toThrow(
			"API Key 대상 입력 형식이 올바르지 않습니다.",
		);
	});
});
