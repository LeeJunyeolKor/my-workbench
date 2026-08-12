import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanToc } from "./PlanToc";

describe("PlanToc", () => {
	it("uses the shared surface treatment", () => {
		const { container } = render(<PlanToc entries={[]} />);

		expect(container.querySelector("nav")?.className).toContain(
			"bg-[var(--workbench-surface)]",
		);
	});
});
