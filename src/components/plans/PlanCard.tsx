import { Link } from "@tanstack/react-router";
import { Pill } from "#/components/ui/Pill";
import { surfaceClassName } from "#/components/ui/surfaceClassName";
import type { PlanSummary } from "#/lib/plans/types";

type PlanCardProps = {
	plan: PlanSummary;
};

function formatModified(iso: string): string {
	return new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(iso));
}

export function PlanCard({ plan }: PlanCardProps) {
	const progress =
		plan.progressTotal > 0 ? `${plan.progressDone}/${plan.progressTotal}` : "—";

	return (
		<Link
			to="/plans/$taskId"
			params={{ taskId: plan.taskId }}
			className={surfaceClassName(
				"block border-[#d0d7de] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[#54aeff]/45 hover:bg-[#ddf4ff]/35 hover:shadow-[0_8px_24px_rgba(84,174,255,0.16)] dark:border-[#30363d] dark:hover:border-[#58a6ff]/45 dark:hover:bg-[#102a43]/45",
			)}
		>
			<Pill
				variant="status"
				className="font-mono font-bold"
				style={{
					background: `${plan.accent}20`,
					color: plan.accent,
					border: `1px solid ${plan.accent}30`,
				}}
			>
				{plan.taskId}
			</Pill>
			<p className="mt-3 line-clamp-3 text-sm font-semibold leading-snug dark:text-zinc-100 text-zinc-800">
				{plan.title}
			</p>
			<div className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px] dark:text-zinc-400 text-zinc-500">
				<Pill variant="status" tone="neutral" className="text-[11px]">
					작업 {progress}
				</Pill>
				{plan.repo ? (
					<Pill variant="status" tone="blue" className="text-[11px]">
						{plan.repo}
					</Pill>
				) : null}
				<span className="pl-1 text-xs">{formatModified(plan.modifiedAt)}</span>
			</div>
		</Link>
	);
}
