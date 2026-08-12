import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModalSurface, modalSurfaceClassName } from "./ModalSurface";

describe("ModalSurface", () => {
	it("keeps modal shells on the shared surface path", () => {
		expect(modalSurfaceClassName("max-w-lg")).toContain(
			"bg-[var(--workbench-surface)]",
		);
		expect(modalSurfaceClassName("max-w-lg")).toContain("max-w-lg");

		render(<ModalSurface className="max-w-lg">Settings</ModalSurface>);

		const dialog = screen.getByRole("dialog");

		expect(dialog.getAttribute("aria-modal")).toBe("true");
		expect(dialog.className).toContain(
			"shadow-[var(--workbench-panel-shadow)]",
		);
	});
});
