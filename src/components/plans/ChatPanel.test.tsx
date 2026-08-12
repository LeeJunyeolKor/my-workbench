import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";

const serverFn = vi.hoisted(() => vi.fn(() => new Promise(() => undefined)));
const invalidate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate }),
}));

vi.mock("@tanstack/react-start", () => ({
	useServerFn: () => serverFn,
}));

vi.mock("#/server/plans", () => ({
	approveChatChangeFn: vi.fn(),
	getChatHistoryFn: vi.fn(),
	sendChatMessageFn: vi.fn(),
}));

describe("ChatPanel", () => {
	it("labels the side layout toggle explicitly", () => {
		render(
			<ChatPanel
				taskId="DEMO-1"
				currentFile="plan.md"
				agentType="codex"
				cliPath="codex"
				selectedText={null}
				clearSelection={vi.fn()}
				chatPosition="side"
				onPositionChange={vi.fn()}
			/>,
		);

		expect(
			screen.getByTitle("하단 레이아웃으로 전환").getAttribute("aria-label"),
		).toBe("하단 레이아웃으로 전환");
	});

	it("labels the message submit button", () => {
		render(
			<ChatPanel
				taskId="DEMO-1"
				currentFile="plan.md"
				agentType="codex"
				cliPath="codex"
				selectedText={null}
				clearSelection={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: "메시지 보내기" })).toBeTruthy();
	});
});
