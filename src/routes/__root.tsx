import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getBrowserStorage } from "#/lib/browser-storage";
import { getInitialTheme, type ThemePreference } from "#/lib/theme-preference";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "My Workbench" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/svg+xml", href: "/workbench.svg" },
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	const [theme, setTheme] = useState<ThemePreference>("dark");

	useEffect(() => {
		const prefersDark = window.matchMedia(
			"(prefers-color-scheme: dark)",
		).matches;
		const initialTheme = getInitialTheme(getBrowserStorage(), prefersDark);

		setTheme(initialTheme);

		const handleThemeChange = (e: Event) => {
			const customEvent = e as CustomEvent<"light" | "dark">;
			setTheme(customEvent.detail);
		};

		window.addEventListener("theme-changed", handleThemeChange);
		return () => {
			window.removeEventListener("theme-changed", handleThemeChange);
		};
	}, []);

	return (
		<html lang="ko" className={theme}>
			<head>
				<HeadContent />
			</head>
			<body
				className="font-sans antialiased"
				style={{ color: "var(--workbench-text-primary)" }}
			>
				<Outlet />
				<Scripts />
			</body>
		</html>
	);
}
