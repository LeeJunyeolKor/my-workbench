import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { BoardColumn } from "./BoardColumn";

vi.mock("@dnd-kit/core", () => ({
	useDroppable: () => ({
		isOver: false,
		setNodeRef: vi.fn(),
	}),
}));

describe("BoardColumn", () => {
	it("uses the shared surface treatment", () => {
		const element = BoardColumn({
			sectionId: "todo",
			title: "할 일",
			accent: "#8b5cf6",
			tasks: [],
			onSelectTask: () => {},
		});

		expect(isValidElement(element)).toBe(true);
		expect(
			(element as ReactElement<{ className?: string }>).props.className,
		).toContain("bg-[var(--workbench-surface)]");
		expect(
			(element as ReactElement<{ className?: string }>).props.className,
		).toContain("shadow-[var(--workbench-panel-shadow)]");
	});
});
