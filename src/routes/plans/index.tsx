import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "#/components/layout/AppShell";
import { PlanCard } from "#/components/plans/PlanCard";
import { PageHeader } from "#/components/ui/PageHeader";
import { Surface } from "#/components/ui/Surface";
import { listPlans } from "#/lib/local-data-ipc";
import {
	DESKTOP_RUNTIME_REQUIRED_MESSAGE,
	hasTauriRuntime,
} from "#/lib/tauri-ipc";

export const Route = createFileRoute("/plans/")({
	loader: async () => {
		if (!hasTauriRuntime()) {
			return {
				plans: [],
				plansDir: "",
				readOnlyReason: DESKTOP_RUNTIME_REQUIRED_MESSAGE,
			};
		}
		return { ...(await listPlans()), readOnlyReason: null };
	},
	component: PlansIndexPage,
});

function PlansIndexPage() {
	const { plans, plansDir, readOnlyReason } = Route.useLoaderData();

	return (
		<AppShell variant="board">
			<div className="mx-auto w-full max-w-6xl px-6 py-10">
				<PageHeader
					className="[&_h1]:text-xl [&_p]:text-xs"
					title="구현 계획"
					description={
						plansDir ? (
							<code className="block max-w-[440px] truncate rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-1.5 font-mono text-xs text-[#57606a] dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#c9d1d9]">
								{plansDir}
							</code>
						) : undefined
					}
				/>

				{readOnlyReason ? (
					<PlanNotice title="데스크톱 앱이 필요합니다">
						{readOnlyReason}
					</PlanNotice>
				) : plans.length === 0 ? (
					<PlanNotice title="구현 계획 문서가 없습니다">
						<code className="rounded-md border border-[var(--workbench-border-soft)] bg-[var(--workbench-surface-muted)] px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
							{plansDir}/{"{TASK_ID}/plan.md"}
						</code>{" "}
						형식으로 마크다운 문서를 추가해 주세요.
					</PlanNotice>
				) : (
					<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{plans.map((plan) => (
							<PlanCard key={plan.taskId} plan={plan} />
						))}
					</div>
				)}
			</div>
		</AppShell>
	);
}

function PlanNotice({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<Surface className="mt-8 flex items-start gap-4 border-[#d0d7de] bg-white p-6 text-zinc-600 dark:border-[#30363d] dark:bg-[#161b22] dark:text-zinc-300">
			<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
			<div>
				<h2 className="text-sm font-bold text-zinc-800 dark:text-white">
					{title}
				</h2>
				<p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
					{children}
				</p>
			</div>
		</Surface>
	);
}
