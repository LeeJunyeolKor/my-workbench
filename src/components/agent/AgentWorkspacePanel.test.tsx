import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentWorkspacePanel } from "./AgentWorkspacePanel";

const { listenMock } = vi.hoisted(() => ({ listenMock: vi.fn() }));

vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

describe("AgentWorkspacePanel", () => {
	beforeEach(() => {
		listenMock.mockReset();
		delete (window as typeof window & { __TAURI_INTERNALS__?: unknown })
			.__TAURI_INTERNALS__;
	});

	it("disables execution and explains the desktop requirement in a browser", () => {
		render(<AgentWorkspacePanel initialWorkspacePath="/tmp/repo" />);

		expect(screen.getByText("데스크톱 앱이 필요합니다")).toBeTruthy();
		expect(
			screen.getByLabelText("로컬 저장소 경로").hasAttribute("disabled"),
		).toBe(true);
		expect(
			screen.getByRole("button", { name: "선택" }).hasAttribute("disabled"),
		).toBe(true);
		expect(
			screen.getByLabelText("에이전트 실행기").hasAttribute("disabled"),
		).toBe(true);
		expect(screen.getByLabelText("작업 지시").hasAttribute("disabled")).toBe(
			true,
		);
		expect(
			screen
				.getByRole("button", { name: "작업 시작" })
				.hasAttribute("disabled"),
		).toBe(true);
		expect(screen.queryByText("작업을 완료했습니다.")).toBeNull();
		expect(screen.queryByText("src/lib/tauri-ipc.ts")).toBeNull();
	});

	it("enables task execution after the desktop event subscription is ready", async () => {
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			configurable: true,
			value: {},
		});
		listenMock.mockResolvedValue(vi.fn());

		render(<AgentWorkspacePanel initialWorkspacePath="/tmp/repo" />);

		await waitFor(() => {
			expect(
				screen
					.getByRole("button", { name: "작업 시작" })
					.hasAttribute("disabled"),
			).toBe(false);
		});
		expect(
			(screen.getByLabelText("에이전트 실행기") as HTMLSelectElement).value,
		).toBe("codex");
		expect(
			screen.queryByRole("option", { name: "Mock test runner" }),
		).toBeNull();
		expect(screen.queryByText("데스크톱 앱이 필요합니다")).toBeNull();
		expect(listenMock).toHaveBeenCalledWith(
			"my-workbench:agent-event",
			expect.any(Function),
		);
	});
});
