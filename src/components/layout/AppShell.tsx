import type { ReactNode } from "react";
import { TopNav } from "./TopNav";

type AppShellProps = {
	children: ReactNode;
	variant?: "page" | "board";
};

export function AppShell({ children, variant = "page" }: AppShellProps) {
	return (
		<div
			className="flex min-h-screen flex-col"
			style={{
				background:
					variant === "board" ? undefined : "var(--workbench-page-bg)",
				color: "var(--workbench-text-primary)",
			}}
		>
			<TopNav />
			<main
				className={
					variant === "board"
						? "workbench-board-bg flex min-h-0 flex-1 flex-col"
						: "flex-1"
				}
			>
				{children}
			</main>
		</div>
	);
}
