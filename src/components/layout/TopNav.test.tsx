import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "./TopNav";

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
}));

function mockMatchMedia(matches = false) {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: vi.fn().mockReturnValue({ matches }),
	});
}

describe("TopNav", () => {
	beforeEach(() => {
		window.localStorage?.clear();
		mockMatchMedia(false);
	});

	it("shows only the core product routes", () => {
		render(<TopNav />);

		expect(screen.getByRole("link", { name: "업무 콘솔" })).toHaveProperty(
			"href",
			expect.stringContaining("/"),
		);
		expect(screen.getByRole("link", { name: "작업 보드" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "구현 계획" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "에이전트 작업대" })).toBeTruthy();
		expect(screen.queryByRole("link", { name: "워크트리" })).toBeNull();
		expect(screen.queryByRole("link", { name: "에이전트 설정" })).toBeNull();
		expect(screen.queryByText("검색...")).toBeNull();
	});

	it("changes the theme from the header", () => {
		render(<TopNav />);

		fireEvent.click(screen.getByRole("button", { name: "다크 모드로 전환" }));

		expect(
			screen.getByRole("button", { name: "라이트 모드로 전환" }),
		).toBeTruthy();
	});
});
