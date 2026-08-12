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
});
