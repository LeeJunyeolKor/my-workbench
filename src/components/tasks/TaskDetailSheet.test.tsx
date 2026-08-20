import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskDetailSheet } from "./TaskDetailSheet";

describe("TaskDetailSheet", () => {
	it("메모를 원문 형식이 보존되는 단일행 입력으로 편집한다", () => {
		render(
			<TaskDetailSheet
				task={{
					id: "task-1",
					title: "작업",
					note: "단일행 메모",
					checked: false,
					subtasks: [],
					section: "todo",
				}}
				sections={[{ id: "todo", name: "할 일" }]}
				onClose={vi.fn()}
				onUpdate={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);

		expect(screen.getByLabelText("메모").tagName).toBe("INPUT");
	});

	it("굵게 표시 구분자가 들어간 제목은 저장하지 않는다", () => {
		const onUpdate = vi.fn();
		render(
			<TaskDetailSheet
				task={{
					id: "task-1",
					title: "작업",
					note: "",
					checked: false,
					subtasks: [],
					section: "todo",
				}}
				sections={[{ id: "todo", name: "할 일" }]}
				onClose={vi.fn()}
				onUpdate={onUpdate}
				onDelete={vi.fn()}
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
			(screen.getByRole("button", { name: "저장" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(onUpdate).not.toHaveBeenCalled();
	});

	it("read-only mode disables edit and delete actions", () => {
		const onUpdate = vi.fn();
		const onDelete = vi.fn();
		render(
			<TaskDetailSheet
				task={{
					id: "task-1",
					title: "DEMO-1 — 첫 작업",
					note: "메모",
					checked: false,
					subtasks: [{ text: "하위 작업", checked: false }],
					section: "todo",
				}}
				sections={[{ id: "todo", name: "할 일" }]}
				onClose={vi.fn()}
				onUpdate={onUpdate}
				onDelete={onDelete}
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
			(screen.getByRole("button", { name: "삭제" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(screen.getByRole("button", { name: "저장" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "삭제" }));
		fireEvent.click(screen.getByRole("button", { name: "저장" }));
		expect(onDelete).not.toHaveBeenCalled();
		expect(onUpdate).not.toHaveBeenCalled();
	});
});
