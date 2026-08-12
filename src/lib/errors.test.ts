import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
	it("returns an Error message when available", () => {
		expect(getErrorMessage(new Error("failed"), "fallback")).toBe("failed");
	});

	it("returns the fallback for non-Error values", () => {
		expect(getErrorMessage("failed", "fallback")).toBe("fallback");
	});

	it("returns the fallback for empty Error messages", () => {
		expect(getErrorMessage(new Error(""), "fallback")).toBe("fallback");
	});
});
