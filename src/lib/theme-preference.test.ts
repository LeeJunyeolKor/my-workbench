import { describe, expect, it } from "vitest";
import { getInitialTheme, THEME_STORAGE_KEY } from "./theme-preference";

describe("getInitialTheme", () => {
	it("uses a valid stored theme before the system preference", () => {
		expect(
			getInitialTheme(
				{
					getItem: (key) => (key === THEME_STORAGE_KEY ? "light" : null),
				},
				true,
			),
		).toBe("light");
	});

	it("falls back to system preference when storage is unavailable or invalid", () => {
		expect(getInitialTheme(null, false)).toBe("light");
		expect(
			getInitialTheme(
				{
					getItem: () => "sepia",
				},
				true,
			),
		).toBe("dark");
		expect(
			getInitialTheme(
				{
					getItem: () => {
						throw new Error("storage blocked");
					},
				},
				false,
			),
		).toBe("light");
	});
});
