import { safeGetStorageItem } from "./browser-storage";

export const THEME_STORAGE_KEY = "theme";

export type ThemePreference = "light" | "dark";

type ReadableStorage = {
	getItem: (key: string) => string | null;
};

export function getInitialTheme(
	storage: ReadableStorage | null | undefined,
	prefersDark: boolean,
): ThemePreference {
	const savedTheme = safeGetStorageItem(storage, THEME_STORAGE_KEY);
	if (savedTheme === "light" || savedTheme === "dark") {
		return savedTheme;
	}

	return prefersDark ? "dark" : "light";
}
