import { act, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "./TopNav";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		activeOptions: _activeOptions,
		activeProps: _activeProps,
		children,
		inactiveProps: _inactiveProps,
		to,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
		activeOptions?: unknown;
		activeProps?: unknown;
		children: React.ReactNode;
		inactiveProps?: unknown;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	useNavigate: () => navigate,
}));

vi.mock("#/server/search", () => ({
	globalSearch: vi.fn(),
}));

const searchPlaceholder = "작업, 계획, 워크트리 검색";

function mockMatchMedia(matches = false) {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: vi.fn().mockReturnValue({
			addEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
			matches,
			media: "(prefers-color-scheme: dark)",
			onchange: null,
			removeEventListener: vi.fn(),
		}),
	});
}

describe("TopNav", () => {
	beforeEach(() => {
		navigate.mockReset();
		delete window.myWorkbenchCommandPalette;
		window.localStorage?.clear();
		mockMatchMedia(false);
	});

	it("opens the command palette from the search trigger", () => {
		render(<TopNav />);

		expect(screen.queryByPlaceholderText(searchPlaceholder)).toBeNull();
		fireEvent.click(
			screen.getByText("검색...").closest("button") as HTMLElement,
		);

		expect(screen.getByPlaceholderText(searchPlaceholder)).toBeTruthy();
	});

	it("uses the operations console as the main navigation entry", () => {
		render(<TopNav />);

		expect(
			screen.getByRole("link", { name: "업무 콘솔" }).getAttribute("href"),
		).toBe("/");
		expect(screen.queryByRole("link", { name: "디자인 프리뷰" })).toBeNull();
	});

	it("does not expose the removed Plan AI settings", () => {
		render(<TopNav />);

		expect(screen.queryByRole("button", { name: "설정 열기" })).toBeNull();
	});

	it("opens the command palette from the shared custom event", () => {
		render(<TopNav />);

		fireEvent(window, new Event("toggle-command-palette"));

		expect(screen.getByPlaceholderText(searchPlaceholder)).toBeTruthy();
	});

	it("exposes a small command palette API for route-local triggers", () => {
		render(<TopNav />);

		act(() => {
			window.myWorkbenchCommandPalette?.open();
		});

		expect(screen.getByPlaceholderText(searchPlaceholder)).toBeTruthy();
	});
});
