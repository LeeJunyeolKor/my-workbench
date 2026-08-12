import { describe, expect, it } from "vitest";
import { safeGetStorageItem, safeSetStorageItem } from "./browser-storage";

describe("safeGetStorageItem", () => {
	it("returns null when storage is unavailable or throws", () => {
		expect(safeGetStorageItem(null, "theme")).toBeNull();
		expect(
			safeGetStorageItem(
				{
					getItem: () => {
						throw new Error("storage blocked");
					},
				},
				"theme",
			),
		).toBeNull();
	});

	it("returns the stored value when storage is available", () => {
		expect(
			safeGetStorageItem(
				{
					getItem: (key) => (key === "theme" ? "dark" : null),
				},
				"theme",
			),
		).toBe("dark");
	});
});

describe("safeSetStorageItem", () => {
	it("reports whether writing to storage succeeded", () => {
		const writes: Record<string, string> = {};

		expect(
			safeSetStorageItem(
				{
					setItem: (key, value) => {
						writes[key] = value;
					},
				},
				"theme",
				"dark",
			),
		).toBe(true);
		expect(writes).toEqual({ theme: "dark" });

		expect(safeSetStorageItem(null, "theme", "light")).toBe(false);
		expect(
			safeSetStorageItem(
				{
					setItem: () => {
						throw new Error("quota exceeded");
					},
				},
				"theme",
				"light",
			),
		).toBe(false);
	});
});
