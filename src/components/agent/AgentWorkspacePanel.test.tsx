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
			screen.getByLabelText("Local repository path").hasAttribute("disabled"),
		).toBe(true);
		expect(
			screen.getByRole("button", { name: "Set" }).hasAttribute("disabled"),
		).toBe(true);
		expect(screen.getByLabelText("Agent runner").hasAttribute("disabled")).toBe(
			true,
		);
		expect(screen.getByLabelText("Task prompt").hasAttribute("disabled")).toBe(
			true,
		);
		expect(
			screen
				.getByRole("button", { name: "Start task" })
				.hasAttribute("disabled"),
		).toBe(true);
		expect(screen.queryByText("Task completed successfully")).toBeNull();
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
					.getByRole("button", { name: "Start task" })
					.hasAttribute("disabled"),
			).toBe(false);
		});
		expect(
			(screen.getByLabelText("Agent runner") as HTMLSelectElement).value,
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
