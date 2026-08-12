import { render, screen } from "@testing-library/react";
import type React from "react";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlanSummary } from "#/lib/plans/types";
import { PlanCard } from "./PlanCard";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		params: _params,
		to,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
		children: React.ReactNode;
		params?: unknown;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

const plan: PlanSummary = {
	taskId: "DEMO-100",
	title: "web-app framework migration",
	progressDone: 2,
	progressTotal: 4,
	modifiedAt: "2026-06-16T01:00:00.000Z",
	accent: "#2563eb",
	repo: "web-app",
};

describe("PlanCard", () => {
	it("uses the shared surface treatment", () => {
		const element = PlanCard({ plan });

		expect(isValidElement(element)).toBe(true);
		expect(
			(element as ReactElement<{ className?: string }>).props.className,
		).toContain("bg-[var(--workbench-surface)]");
		expect(
			(element as ReactElement<{ className?: string }>).props.className,
		).toContain("shadow-[var(--workbench-panel-shadow)]");
	});

	it("labels progress as work items in Korean", () => {
		render(<PlanCard plan={plan} />);

		expect(screen.getByText("작업 2/4")).toBeTruthy();
		expect(screen.queryByText("Tasks 2/4")).toBeNull();
	});
});
