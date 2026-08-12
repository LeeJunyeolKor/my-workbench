import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanMarkdown } from "./PlanMarkdown";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
}));

describe("PlanMarkdown", () => {
	it("labels the view mode toggle and exposes the selected mode", () => {
		render(<PlanMarkdown html="<p>렌더링된 문서</p>" raw="# 원문" />);

		const previewButton = screen.getByRole("button", { name: "미리보기" });
		const rawButton = screen.getByRole("button", { name: "원문" });

		expect(screen.getByRole("group", { name: "문서 보기 모드" })).toBeTruthy();
		expect(previewButton.getAttribute("aria-pressed")).toBe("true");
		expect(rawButton.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(rawButton);

		expect(previewButton.getAttribute("aria-pressed")).toBe("false");
		expect(rawButton.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByText("# 원문")).toBeTruthy();
	});
});
