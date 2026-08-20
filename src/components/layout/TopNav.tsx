import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { getBrowserStorage, safeSetStorageItem } from "#/lib/browser-storage";
import { cn } from "#/lib/cn";
import {
	getInitialTheme,
	THEME_STORAGE_KEY,
	type ThemePreference,
} from "#/lib/theme-preference";

const nav = [
	{ to: "/", label: "업무 콘솔", exact: true },
	{ to: "/tasks", label: "작업 보드" },
	{ to: "/plans", label: "구현 계획" },
	{ to: "/agent-slice", label: "에이전트 작업대" },
] as const;

export function TopNav() {
	const [theme, setTheme] = useState<ThemePreference>("dark");

	useEffect(() => {
		const initialTheme = getInitialTheme(
			getBrowserStorage(),
			window.matchMedia("(prefers-color-scheme: dark)").matches,
		);
		setTheme(initialTheme);

		const handleThemeChange = (event: Event) => {
			setTheme((event as CustomEvent<ThemePreference>).detail);
		};
		window.addEventListener("theme-changed", handleThemeChange);
		return () => window.removeEventListener("theme-changed", handleThemeChange);
	}, []);

	const toggleTheme = () => {
		const nextTheme = theme === "light" ? "dark" : "light";
		safeSetStorageItem(getBrowserStorage(), THEME_STORAGE_KEY, nextTheme);
		window.dispatchEvent(
			new CustomEvent("theme-changed", { detail: nextTheme }),
		);
	};

	return (
		<header className="sticky top-0 z-50 flex h-12 min-w-0 items-center gap-3 border-b border-[var(--workbench-nav-border)] bg-[var(--workbench-nav-bg)] px-4 text-[var(--workbench-nav-text)]">
			<Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
				<img src="/workbench.svg" alt="" className="h-7 w-7 rounded-md" />
				<span className="hidden sm:inline">My Workbench</span>
			</Link>

			<nav className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap">
				{nav.map((item) => (
					<Link
						key={item.to}
						to={item.to}
						activeOptions={
							"exact" in item && item.exact ? { exact: true } : undefined
						}
						className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
						activeProps={{
							"aria-current": "page",
							className: cn(
								"bg-[var(--workbench-nav-active)] text-zinc-900 dark:text-white",
							),
						}}
						inactiveProps={{
							className: cn(
								"text-[var(--workbench-nav-muted)] hover:bg-[var(--workbench-nav-hover)] hover:text-zinc-800 dark:hover:text-white",
							),
						}}
					>
						{item.label}
					</Link>
				))}
			</nav>

			<button
				type="button"
				onClick={toggleTheme}
				className="shrink-0 cursor-pointer rounded-md p-1.5 text-[var(--workbench-nav-muted)] transition-colors hover:bg-[var(--workbench-nav-hover)] hover:text-zinc-800 dark:hover:text-white"
				title={theme === "light" ? "다크 모드 전환" : "라이트 모드 전환"}
				aria-label={
					theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"
				}
			>
				{theme === "light" ? (
					<Moon className="h-4 w-4" />
				) : (
					<Sun className="h-4 w-4 text-[var(--workbench-accent-yellow)]" />
				)}
			</button>
		</header>
	);
}
