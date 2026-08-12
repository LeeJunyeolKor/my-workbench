import { describe, expect, it } from "vitest";
import {
	normalizeChatHistory,
	parseApproveChatChangeInput,
	parseChatHistoryInput,
	parseModifyPlanWithAIInput,
	parseSavePlanFileInput,
	parseSavePlanFileOrderInput,
	parseSendChatMessageInput,
} from "./plans";

describe("normalizeChatHistory", () => {
	it("falls back to idle history when saved chat history has the wrong shape", () => {
		expect(
			normalizeChatHistory({
				chatId: 123,
				status: "stuck",
				messages: "hello",
				liveLog: null,
			}),
		).toEqual({
			chatId: "",
			status: "idle",
			messages: [],
			liveLog: "",
		});
	});
});

describe("parseModifyPlanWithAIInput", () => {
	it("normalizes safe plan AI edit input", () => {
		expect(
			parseModifyPlanWithAIInput({
				taskId: " DEMO-101 ",
				filename: " plan.md ",
				instruction: "정리해줘",
				comments: [{ selectedText: "원문", comment: "바꿔줘" }],
				agentType: " codex ",
				cliPath: " codex ",
			}),
		).toEqual({
			taskId: "DEMO-101",
			filename: "plan.md",
			instruction: "정리해줘",
			comments: [{ selectedText: "원문", comment: "바꿔줘" }],
			agentType: "codex",
			cliPath: "codex",
		});
	});

	it("rejects unsupported AI edit agents", () => {
		expect(() =>
			parseModifyPlanWithAIInput({
				taskId: "DEMO-101",
				filename: "plan.md",
				instruction: "정리해줘",
				agentType: "vim",
				cliPath: "",
			}),
		).toThrow("지원하지 않는 AI 에이전트입니다.");
	});

	it("rejects malformed AI edit comments", () => {
		expect(() =>
			parseModifyPlanWithAIInput({
				taskId: "DEMO-101",
				filename: "plan.md",
				comments: [{ selectedText: "원문", comment: "" }],
				agentType: "gemini",
				cliPath: "",
			}),
		).toThrow("AI 수정 코멘트 형식이 올바르지 않습니다.");
	});
});

describe("parseSendChatMessageInput", () => {
	it("normalizes safe chat input", () => {
		expect(
			parseSendChatMessageInput({
				taskId: " DEMO-101 ",
				filename: " plan.md ",
				message: "확인해줘",
				selectedText: "문단",
				agentType: " claude ",
				cliPath: " claude ",
			}),
		).toEqual({
			taskId: "DEMO-101",
			filename: "plan.md",
			message: "확인해줘",
			selectedText: "문단",
			agentType: "claude",
			cliPath: "claude",
		});
	});

	it("rejects empty chat messages", () => {
		expect(() =>
			parseSendChatMessageInput({
				taskId: "DEMO-101",
				filename: "plan.md",
				message: "  ",
				agentType: "cursor",
				cliPath: "agent",
			}),
		).toThrow("메시지를 입력해 주세요.");
	});

	it("rejects unsupported chat agents", () => {
		expect(() =>
			parseSendChatMessageInput({
				taskId: "DEMO-101",
				filename: "plan.md",
				message: "확인해줘",
				agentType: "vim",
				cliPath: "",
			}),
		).toThrow("지원하지 않는 AI 에이전트입니다.");
	});
});

describe("parseChatHistoryInput", () => {
	it("normalizes safe chat history input", () => {
		expect(parseChatHistoryInput({ taskId: " DEMO-101 " })).toEqual({
			taskId: "DEMO-101",
		});
	});

	it("rejects task ids that cannot be used as safe path fragments", () => {
		expect(() => parseChatHistoryInput({ taskId: "../escape" })).toThrow(
			"올바르지 않은 작업 ID입니다.",
		);
	});
});

describe("parseApproveChatChangeInput", () => {
	it("normalizes safe approval input", () => {
		expect(
			parseApproveChatChangeInput({
				taskId: " DEMO-101 ",
				approve: false,
			}),
		).toEqual({
			taskId: "DEMO-101",
			approve: false,
		});
	});

	it("rejects non-boolean approval values", () => {
		expect(() =>
			parseApproveChatChangeInput({
				taskId: "DEMO-101",
				approve: "true",
			}),
		).toThrow("승인 여부 입력 형식이 올바르지 않습니다.");
	});
});

describe("parseSavePlanFileOrderInput", () => {
	it("normalizes safe file order input", () => {
		expect(
			parseSavePlanFileOrderInput({
				taskId: " DEMO-101 ",
				filenames: [" plan.md ", "notes/detail.md"],
			}),
		).toEqual({
			taskId: "DEMO-101",
			filenames: ["plan.md", "notes/detail.md"],
		});
	});

	it("rejects unsafe file order paths", () => {
		expect(() =>
			parseSavePlanFileOrderInput({
				taskId: "DEMO-101",
				filenames: ["../secret.md"],
			}),
		).toThrow("잘못된 접근 경로입니다 (Path traversal 차단).");
	});
});

describe("parseSavePlanFileInput", () => {
	it("normalizes safe file save input and allows empty content", () => {
		expect(
			parseSavePlanFileInput({
				taskId: " DEMO-101 ",
				filename: " plan.md ",
				content: "",
			}),
		).toEqual({
			taskId: "DEMO-101",
			filename: "plan.md",
			content: "",
		});
	});

	it("rejects non-markdown file saves", () => {
		expect(() =>
			parseSavePlanFileInput({
				taskId: "DEMO-101",
				filename: "plan.txt",
				content: "hello",
			}),
		).toThrow("마크다운 파일(.md)만 사용할 수 있습니다.");
	});

	it("rejects malformed file content", () => {
		expect(() =>
			parseSavePlanFileInput({
				taskId: "DEMO-101",
				filename: "plan.md",
				content: null,
			}),
		).toThrow("구현 계획 파일 내용 입력 형식이 올바르지 않습니다.");
	});
});
