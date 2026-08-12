import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Save, Settings, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { AppShell } from "#/components/layout/AppShell";
import { PlanCard } from "#/components/plans/PlanCard";
import { ModalSurface } from "#/components/ui/ModalSurface";
import { PageHeader } from "#/components/ui/PageHeader";
import { Surface } from "#/components/ui/Surface";
import { getErrorMessage } from "#/lib/errors";
import { listPlans, savePlanSettings } from "#/server/plans";

export const Route = createFileRoute("/plans/")({
	loader: () => listPlans(),
	component: PlansIndexPage,
});

function PlansIndexPage() {
	const { plans, plansDir } = Route.useLoaderData();

	return (
		<AppShell variant="board">
			<div className="w-full mx-auto max-w-6xl px-6 py-10">
				<PageHeader
					className="[&_h1]:text-xl [&_p]:text-xs"
					title="구현 계획"
					description={<PlanDirectorySettings plansDir={plansDir} />}
				/>

				{plans.length === 0 ? (
					<Surface className="mt-8 flex items-start gap-4 border-[#d0d7de] bg-white p-6 text-zinc-600 dark:border-[#30363d] dark:bg-[#161b22] dark:text-zinc-300">
						<AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
						<div>
							<h3 className="text-sm font-bold dark:text-white text-zinc-800">
								구현 계획 문서가 없습니다
							</h3>
							<p className="text-xs dark:text-zinc-400 text-zinc-500 mt-1.5 leading-relaxed">
								<code className="rounded-md border border-[var(--workbench-border-soft)] bg-[var(--workbench-surface-muted)] px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
									{plansDir}/{"{TASK_ID}/plan.md"}
								</code>{" "}
								형식으로 마크다운 문서를 추가해 주세요.
							</p>
						</div>
					</Surface>
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

function PlanDirectorySettings({ plansDir }: { plansDir: string }) {
	const router = useRouter();
	const savePlanSettingsFn = useServerFn(savePlanSettings);
	const [value, setValue] = useState(plansDir);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		setValue(plansDir);
	}, [plansDir]);

	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !isSaving) setIsOpen(false);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, isSaving]);

	const openModal = () => {
		setValue(plansDir);
		setError(null);
		setIsOpen(true);
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const nextPlansDir = String(formData.get("plansDir") ?? "");
		if (isSaving || nextPlansDir.trim() === plansDir) return;

		setIsSaving(true);
		setError(null);
		try {
			const result = await savePlanSettingsFn({
				data: { plansDir: nextPlansDir },
			});
			setValue(result.plansDir);
			await router.invalidate();
			setIsOpen(false);
		} catch (err) {
			setError(getErrorMessage(err, "구현 계획 위치를 저장하지 못했습니다."));
		} finally {
			setIsSaving(false);
		}
	};
	const handleInput = (event: FormEvent<HTMLInputElement>) => {
		setValue(event.currentTarget.value);
	};

	return (
		<>
			<div className="flex w-full items-center gap-2 sm:w-[440px]">
				<code className="min-w-0 flex-1 truncate rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-1.5 font-mono text-xs text-[#57606a] dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#c9d1d9]">
					{plansDir}
				</code>
				<button
					type="button"
					onClick={openModal}
					className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d0d7de] bg-white text-[#57606a] transition hover:border-[#54aeff]/45 hover:bg-[#ddf4ff]/45 hover:text-[#0969da] focus:outline-none focus:ring-3 focus:ring-blue-100 dark:border-[#30363d] dark:bg-[#161b22] dark:text-[#8b949e] dark:hover:border-[#58a6ff]/45 dark:hover:bg-[#102a43]/55 dark:hover:text-[#79c0ff] dark:focus:ring-blue-950/50"
					aria-label="구현 계획 위치 설정"
					title="구현 계획 위치 설정"
				>
					<Settings className="h-4 w-4" />
				</button>
			</div>

			{isOpen ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm">
					<button
						type="button"
						aria-label="구현 계획 위치 설정 배경 닫기"
						className="absolute inset-0 cursor-default"
						onClick={() => {
							if (!isSaving) setIsOpen(false);
						}}
					/>
					<ModalSurface
						className="relative max-w-lg"
						aria-labelledby="plan-directory-settings-title"
					>
						<form onSubmit={handleSubmit}>
							<header className="flex items-start justify-between gap-4 border-b border-[var(--workbench-border-soft)] px-5 py-4">
								<div>
									<h2
										id="plan-directory-settings-title"
										className="text-base font-bold text-zinc-900 dark:text-white"
									>
										구현 계획 위치 설정
									</h2>
								</div>
								<button
									type="button"
									onClick={() => {
										if (!isSaving) setIsOpen(false);
									}}
									disabled={isSaving}
									className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
									aria-label="구현 계획 위치 설정 닫기"
								>
									<X className="h-4 w-4" />
								</button>
							</header>

							<div className="px-5 py-5">
								<label
									htmlFor="workbench-plans-dir"
									className="text-xs font-semibold text-zinc-600 dark:text-zinc-300"
								>
									구현 계획 위치
								</label>
								<input
									id="workbench-plans-dir"
									name="plansDir"
									type="text"
									value={value}
									onChange={handleInput}
									onInput={handleInput}
									className="mt-2 w-full rounded-md border border-[#d0d7de] bg-white px-3 py-2 font-mono text-xs text-[#24292f] outline-none transition focus:border-[#54aeff] focus:ring-3 focus:ring-blue-100 dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#c9d1d9] dark:focus:border-[#58a6ff] dark:focus:ring-blue-950/50"
									disabled={isSaving}
								/>
								{error ? (
									<p className="mt-2 text-xs text-red-600">{error}</p>
								) : null}
							</div>

							<footer className="flex justify-end gap-2 border-t border-[var(--workbench-border-soft)] bg-zinc-50 px-5 py-4 dark:bg-zinc-900/60">
								<button
									type="button"
									onClick={() => setIsOpen(false)}
									disabled={isSaving}
									className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
								>
									취소
								</button>
								<button
									type="submit"
									disabled={isSaving}
									className="inline-flex items-center gap-1.5 rounded-md bg-[#0969da] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0757b8] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#1f6feb] dark:hover:bg-[#388bfd]"
									aria-label="구현 계획 위치 저장"
								>
									<Save className="h-4 w-4" />
									<span>{isSaving ? "저장 중" : "저장"}</span>
								</button>
							</footer>
						</form>
					</ModalSurface>
				</div>
			) : null}
		</>
	);
}
