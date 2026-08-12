import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pill } from "./Pill";

describe("Pill", () => {
	it("supports the repeated repository violet tone", () => {
		render(<Pill tone="violet">fe-scripts</Pill>);

		expect(screen.getByText("fe-scripts").className).toContain("violet");
	});

	it("supports dense status badges for operation console rows", () => {
		render(
			<Pill variant="status" tone="amber">
				검토 필요
			</Pill>,
		);

		const badge = screen.getByText("검토 필요");

		expect(badge.className).toContain("whitespace-nowrap");
		expect(badge.className).toContain("bg-[#fff8c5]");
		expect(badge.className).toContain("dark:bg-[#3d2f12]");
	});
});
