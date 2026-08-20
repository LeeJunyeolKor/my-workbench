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

	it("desktop runtime is required to create tasks", () => {
		const onCreate = vi.fn();
		render(
			<CreateTaskModal
				isOpen
				sections={[{ id: "todo", name: "할 일" }]}
				onClose={vi.fn()}
				onCreate={onCreate}
				readOnlyReason="데스크톱 앱에서만 사용할 수 있습니다."
			/>,
		);

		expect(
			screen.getByText("데스크톱 앱에서만 사용할 수 있습니다."),
		).toBeTruthy();
		expect((screen.getByLabelText("제목") as HTMLInputElement).disabled).toBe(
			true,
		);
		expect(
			(screen.getByRole("button", { name: "추가" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "추가" }));
		expect(onCreate).not.toHaveBeenCalled();
	});

	it("굵게 표시 구분자가 들어간 제목은 저장하지 않는다", () => {
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
			target: { value: "a ** b" },
		});
		expect(
			screen.getByText(
				"제목에는 Markdown 굵게 표시 기호(**)를 사용할 수 없습니다.",
			),
		).toBeTruthy();
		expect(
			(screen.getByRole("button", { name: "추가" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(onCreate).not.toHaveBeenCalled();
	});
});
