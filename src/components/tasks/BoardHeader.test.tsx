import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardHeader } from "./BoardHeader";

describe("BoardHeader", () => {
	it("opens the local task form", () => {
		const onCreateTask = vi.fn();
		render(
			<BoardHeader
				title="내 작업 보드"
				viewMode="board"
				onViewModeChange={() => {}}
				onCreateTask={onCreateTask}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "작업 추가" }));
		expect(onCreateTask).toHaveBeenCalledOnce();
	});

	it("disables task creation in read-only mode", () => {
		const onCreateTask = vi.fn();
		render(
			<BoardHeader
				title="내 작업 보드"
				viewMode="board"
				onViewModeChange={() => {}}
				onCreateTask={onCreateTask}
				readOnly
			/>,
		);

		const button = screen.getByRole("button", { name: "작업 추가" });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(button);
		expect(onCreateTask).not.toHaveBeenCalled();
	});
});
