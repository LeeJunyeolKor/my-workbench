import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { globalSearch } from "#/server/search";
import { CommandPalette } from "./CommandPalette";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
}));

vi.mock("#/server/search", () => ({
	globalSearch: vi.fn(),
}));

const searchPlaceholder = "작업, 계획, 워크트리 검색";

describe("CommandPalette", () => {
	beforeEach(() => {
		navigate.mockReset();
		vi.mocked(globalSearch).mockReset();
	});

	it("stays hidden when closed", () => {
		render(<CommandPalette isOpen={false} onOpenChange={vi.fn()} />);

		expect(screen.queryByPlaceholderText(searchPlaceholder)).toBeNull();
	});

	it("renders when opened by the parent", () => {
		render(<CommandPalette isOpen={true} onOpenChange={vi.fn()} />);

		expect(screen.getByRole("dialog", { name: "통합 검색" })).toBeTruthy();
		expect(screen.getByPlaceholderText(searchPlaceholder)).toBeTruthy();
		expect(
			screen.getByText("보드, 계획, 워크트리에서 검색어를 입력하세요."),
		).toBeTruthy();
	});

	it("closes with Escape after opening", () => {
		const onOpenChange = vi.fn();
		render(<CommandPalette isOpen={true} onOpenChange={onOpenChange} />);

		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("clears the current query without closing the palette", () => {
		render(<CommandPalette isOpen={true} onOpenChange={vi.fn()} />);

		const input = screen.getByPlaceholderText(searchPlaceholder);
		fireEvent.change(input, { target: { value: "DEMO" } });

		fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));

		expect(screen.getByPlaceholderText(searchPlaceholder)).toBeTruthy();
		expect(input).toHaveProperty("value", "");
	});

	it("exposes one accessible close button", () => {
		render(<CommandPalette isOpen={true} onOpenChange={vi.fn()} />);

		expect(screen.getAllByRole("button", { name: "검색 닫기" })).toHaveLength(
			1,
		);
	});

	it("closes and navigates when a result is selected", async () => {
		const onOpenChange = vi.fn();
		vi.mocked(globalSearch).mockResolvedValueOnce([
			{
				id: "plan-1",
				subtitle: "DEMO-1",
				title: "테스트 계획",
				type: "plan",
				url: "/plans/DEMO-1",
			},
		]);
		render(<CommandPalette isOpen={true} onOpenChange={onOpenChange} />);

		fireEvent.change(screen.getByPlaceholderText(searchPlaceholder), {
			target: { value: "DEMO" },
		});

		const resultTitle = await screen.findByText("테스트 계획");
		const resultRow = resultTitle.closest("button") as HTMLElement;
		expect(within(resultRow).getByText("계획")).toBeTruthy();
		expect(within(resultRow).getByText("열기")).toBeTruthy();
		expect(within(resultRow).queryByText("Jump")).toBeNull();

		fireEvent.click(resultTitle);

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(navigate).toHaveBeenCalledWith({ to: "/plans/DEMO-1" });
	});

	it("shows a Korean error state when search fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		vi.mocked(globalSearch).mockRejectedValueOnce(new Error("search failed"));
		render(<CommandPalette isOpen={true} onOpenChange={vi.fn()} />);

		fireEvent.change(screen.getByPlaceholderText(searchPlaceholder), {
			target: { value: "DEMO" },
		});

		expect(
			await screen.findByText(
				"검색 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
			),
		).toBeTruthy();
		expect(consoleError).toHaveBeenCalled();

		consoleError.mockRestore();
	});
});
