import type { ReactNode } from "react";
import { cn } from "#/lib/cn";

type PageHeaderProps = {
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	className?: string;
};

export function PageHeader({
	title,
	description,
	action,
	className,
}: PageHeaderProps) {
	return (
		<header
			className={cn(
				"flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
				className,
			)}
		>
			<div>
				<h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
					{title}
				</h1>
				{description ? (
					<div className="mt-1.5 text-sm text-zinc-550 dark:text-zinc-300">
						{description}
					</div>
				) : null}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</header>
	);
}
