import { surfaceClassName } from "#/components/ui/surfaceClassName";
import type { PlanTocEntry } from "#/lib/plans/types";

type PlanTocProps = {
	entries: PlanTocEntry[];
};

export function PlanToc({ entries }: PlanTocProps) {
	if (entries.length === 0) {
		return (
			<nav className={surfaceClassName("p-4 select-none")}>
				<h2 className="text-xs font-bold uppercase tracking-wider dark:text-zinc-400 text-zinc-500">
					On this page
				</h2>
				<p className="mt-3 text-xs dark:text-zinc-500 text-zinc-400 italic font-sans">
					이 문서에는 목차가 없습니다.
				</p>
			</nav>
		);
	}

	return (
		<nav className={surfaceClassName("p-4")}>
			<h2 className="text-xs font-bold uppercase tracking-wider dark:text-zinc-400 text-zinc-500">
				On this page
			</h2>
			<ul className="mt-3 space-y-2">
				{entries.map((entry) => (
					<li
						key={entry.id}
						style={{ paddingLeft: entry.level === 3 ? "0.75rem" : 0 }}
					>
						<a
							href={`#${entry.id}`}
							className="text-sm dark:text-sky-400 text-sky-600 dark:hover:text-sky-350 hover:text-sky-700 hover:underline transition block truncate max-w-full"
							title={entry.text}
						>
							{entry.text}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
