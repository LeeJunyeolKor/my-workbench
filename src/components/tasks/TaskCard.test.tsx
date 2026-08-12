import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { Task } from "#/lib/tasks/types";
import { TaskCard } from "./TaskCard";

const task: Task = {
	id: "task-1",
	title: "DEMO-101 — Example task",
	note: "",
	checked: false,
	subtasks: [],
	section: "todo",
};

describe("TaskCard", () => {
	it("uses the shared surface treatment", () => {
		const element = TaskCard({ task });

		expect(isValidElement(element)).toBe(true);
		expect(
			(element as ReactElement<{ className?: string }>).props.className,
		).toContain("bg-[var(--workbench-surface)]");
		expect(
			(element as ReactElement<{ className?: string }>).props.className,
		).toContain("shadow-[var(--workbench-panel-shadow)]");
	});
});
