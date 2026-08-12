import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateTaskModal } from "./CreateTaskModal";

describe("CreateTaskModal", () => {
	it("creates a local task in the selected section", () => {
		const onCreate = vi.fn();
		render(
			<CreateTaskModal
				isOpen
				sections={[{ id: "todo", name: "할 일" }]}
				onClose={vi.fn()}
				onCreate={onCreate}
			/>,
		);

		fireEvent.change(screen.getByLabelText("제목"), {
			target: { value: "DEMO-101 — Example task" },
		});
		fireEvent.click(screen.getByRole("button", { name: "추가" }));

		expect(onCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "DEMO-101 — Example task",
				section: "todo",
			}),
		);
	});
});
