import { Link } from "@tanstack/react-router";
import { Moon, Settings, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getBrowserStorage, safeSetStorageItem } from "#/lib/browser-storage";
import { cn } from "#/lib/cn";
import {
	getInitialTheme,
	THEME_STORAGE_KEY,
	type ThemePreference,
} from "#/lib/theme-preference";
import { CommandPalette } from "./CommandPalette";
import { SettingsModal } from "./SettingsModal";

const nav = [
	{ to: "/", label: "업무 콘솔", exact: true },
	{ to: "/tasks", label: "작업 보드" },
	{ to: "/plans", label: "구현 계획" },
	{ to: "/worktrees", label: "워크트리" },
	{ to: "/agent-slice", label: "에이전트 작업대" },
	{ to: "/agent-settings", label: "에이전트 설정" },
] as const;

declare global {
	interface Window {
		myWorkbenchCommandPalette?: {
			close: () => void;
			open: () => void;
			toggle: () => void;
		};
	}
}

export function TopNav() {
	const [theme, setTheme] = useState<ThemePreference>("dark");
	const [settingsModalOpen, setSettingsModalOpen] = useState(false);
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

	const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
	const closeCommandPalette = useCallback(
		() => setCommandPaletteOpen(false),
		[],
	);
	const toggleCommandPalette = useCallback(
		() => setCommandPaletteOpen((isOpen) => !isOpen),
		[],
	);

	useEffect(() => {
		const commandPalette = {
			close: closeCommandPalette,
			open: openCommandPalette,
			toggle: toggleCommandPalette,
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "k") {
				event.preventDefault();
				toggleCommandPalette();
				return;
			}
			if (event.key === "Escape") closeCommandPalette();
		};

		window.myWorkbenchCommandPalette = commandPalette;
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("toggle-command-palette", toggleCommandPalette);

		return () => {
			if (window.myWorkbenchCommandPalette === commandPalette) {
				delete window.myWorkbenchCommandPalette;
			}
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener(
				"toggle-command-palette",
				toggleCommandPalette,
			);
		};
	}, [closeCommandPalette, openCommandPalette, toggleCommandPalette]);

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

			<div className="hidden min-w-0 flex-1 xl:block xl:max-w-md">
				<button
					type="button"
					onClick={toggleCommandPalette}
					className="flex w-full cursor-pointer items-center justify-between rounded-lg bg-[var(--workbench-nav-hover)] px-3 py-1.5 text-sm text-[var(--workbench-nav-muted)] transition hover:opacity-95 active:scale-[0.99]"
				>
					<span>검색...</span>
					<kbd className="hidden h-5 select-none items-center gap-0.5 rounded border border-black/10 bg-black/5 px-1.5 font-mono text-[10px] font-medium text-zinc-550 sm:inline-flex dark:border-white/15 dark:bg-white/5 dark:text-white/40">
						<span className="text-xs">⌘</span>K
					</kbd>
				</button>
			</div>

			<nav className="ml-auto flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap md:flex-none">
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

			<div className="flex shrink-0 items-center gap-1">
				<button
					type="button"
					onClick={() => setSettingsModalOpen(true)}
					className="cursor-pointer rounded-md p-1.5 text-[var(--workbench-nav-muted)] transition-colors hover:bg-[var(--workbench-nav-hover)] hover:text-zinc-800 dark:hover:text-white"
					title="설정"
					aria-label="설정 열기"
				>
					<Settings className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={toggleTheme}
					className="cursor-pointer rounded-md p-1.5 text-[var(--workbench-nav-muted)] transition-colors hover:bg-[var(--workbench-nav-hover)] hover:text-zinc-800 dark:hover:text-white"
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
			</div>

			<SettingsModal
				isOpen={settingsModalOpen}
				onClose={() => setSettingsModalOpen(false)}
			/>
			<CommandPalette
				isOpen={commandPaletteOpen}
				onOpenChange={setCommandPaletteOpen}
			/>
		</header>
	);
}
