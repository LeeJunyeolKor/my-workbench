import { createFileRoute } from "@tanstack/react-router";
import { Code2 } from "lucide-react";
import { AgentWorkspacePanel } from "#/components/agent/AgentWorkspacePanel";
import { AppShell } from "#/components/layout/AppShell";
import { InlineNotice } from "#/components/ui/InlineNotice";
import { Pill } from "#/components/ui/Pill";

export const Route = createFileRoute("/agent-slice")({
	component: AgentSlicePage,
});

export function AgentSlicePage() {
	return (
		<AppShell variant="board">
			<div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
				<header className="flex flex-col gap-3 border-b border-[#d0d7de] pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-[#30363d]">
					<div>
						<h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[#24292f] dark:text-[#f0f6fc]">
							<Code2 className="h-7 w-7 text-indigo-500" />
							에이전트 작업대
						</h1>
						<p className="mt-1 text-sm text-[#57606a] dark:text-[#8b949e]">
							실제 My Workbench 흐름에서 단일 작업의 실행, 취소, 로그, 변경
							파일을 확인합니다.
						</p>
					</div>
					<Pill variant="status" tone="violet">
						로컬 에이전트 런타임
					</Pill>
				</header>

				<InlineNotice tone="info" title="Rust 기준 상태">
					Tauri 이벤트 스트림을 하나의 TaskViewState로 반영합니다. 다른 작업의
					이전 이벤트는 무시하고, 완료·실패·취소 상태를 유지합니다.
				</InlineNotice>

				<AgentWorkspacePanel />
			</div>
		</AppShell>
	);
}
