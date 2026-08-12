import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineNotice, inlineNoticeClassName } from "./InlineNotice";

describe("InlineNotice", () => {
	it("uses tone-specific surface classes", () => {
		const className = inlineNoticeClassName("error", "mt-4");

		expect(className).toContain("bg-[#ffebe9]/80");
		expect(className).toContain("dark:bg-[#3d1719]/75");
		expect(className).toContain("mt-4");
	});

	it("renders a dismissible notice", () => {
		render(
			<InlineNotice
				tone="warning"
				title="확인이 필요합니다"
				onDismiss={() => {}}
			>
				브랜치가 선택되지 않았습니다.
			</InlineNotice>,
		);

		expect(screen.getByText("확인이 필요합니다")).toBeTruthy();
		expect(screen.getByText("브랜치가 선택되지 않았습니다.")).toBeTruthy();
		expect(screen.getByRole("button", { name: "알림 닫기" })).toBeTruthy();
	});
});
