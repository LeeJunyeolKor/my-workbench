import { describe, expect, it } from "vitest";
import { parseSavePlanFileInput, parseSavePlanFileOrderInput } from "./plans";

describe("parseSavePlanFileOrderInput", () => {
	it("normalizes safe file order input", () => {
		expect(
			parseSavePlanFileOrderInput({
				taskId: " DEMO-101 ",
				filenames: [" plan.md ", "notes/detail.md"],
			}),
		).toEqual({
			taskId: "DEMO-101",
			filenames: ["plan.md", "notes/detail.md"],
		});
	});

	it("rejects unsafe file order paths", () => {
		expect(() =>
			parseSavePlanFileOrderInput({
				taskId: "DEMO-101",
				filenames: ["../secret.md"],
			}),
		).toThrow("잘못된 접근 경로입니다 (Path traversal 차단).");
	});
});

describe("parseSavePlanFileInput", () => {
	it("normalizes safe file save input and allows empty content", () => {
		expect(
			parseSavePlanFileInput({
				taskId: " DEMO-101 ",
				filename: " plan.md ",
				content: "",
			}),
		).toEqual({
			taskId: "DEMO-101",
			filename: "plan.md",
			content: "",
		});
	});

	it("rejects non-markdown file saves", () => {
		expect(() =>
			parseSavePlanFileInput({
				taskId: "DEMO-101",
				filename: "plan.txt",
				content: "hello",
			}),
		).toThrow("마크다운 파일(.md)만 사용할 수 있습니다.");
	});

	it("rejects malformed file content", () => {
		expect(() =>
			parseSavePlanFileInput({
				taskId: "DEMO-101",
				filename: "plan.md",
				content: null,
			}),
		).toThrow("구현 계획 파일 내용 입력 형식이 올바르지 않습니다.");
	});
});
