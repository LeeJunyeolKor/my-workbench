import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "#/lib/cn";

export type InlineNoticeTone = "info" | "success" | "warning" | "error";

const toneClassNames: Record<InlineNoticeTone, string> = {
	info: "border-[#54aeff]/35 bg-[#ddf4ff]/70 text-[#0969da] dark:border-[#58a6ff]/35 dark:bg-[#102a43]/70 dark:text-[#79c0ff]",
	success:
		"border-[#2da44e]/30 bg-[#dafbe1]/70 text-[#1a7f37] dark:border-[#3fb950]/35 dark:bg-[#12351f]/70 dark:text-[#7ee787]",
	warning:
		"border-[#bf8700]/35 bg-[#fff8c5]/80 text-[#9a6700] dark:border-[#d29922]/35 dark:bg-[#3b2e12]/75 dark:text-[#e3b341]",
	error:
		"border-[#cf222e]/25 bg-[#ffebe9]/80 text-[#cf222e] dark:border-[#f85149]/35 dark:bg-[#3d1719]/75 dark:text-[#ff7b72]",
};

const icons = {
	info: Info,
	success: CheckCircle2,
	warning: AlertTriangle,
	error: XCircle,
};

export function inlineNoticeClassName(
	tone: InlineNoticeTone,
	className?: string,
) {
	return cn(
		"flex items-start gap-3 rounded-md border p-3 text-sm shadow-[var(--workbench-panel-shadow)]",
		toneClassNames[tone],
		className,
	);
}

type InlineNoticeProps = {
	tone: InlineNoticeTone;
	title: string;
	children?: ReactNode;
	className?: string;
	onDismiss?: () => void;
};

export function InlineNotice({
	tone,
	title,
	children,
	className,
	onDismiss,
}: InlineNoticeProps) {
	const Icon = icons[tone];

	return (
		<div className={inlineNoticeClassName(tone, className)}>
			<Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
			<div className="min-w-0 flex-1">
				<p className="font-semibold leading-5">{title}</p>
				{children ? (
					<div className="mt-1 leading-5 text-current/85">{children}</div>
				) : null}
			</div>
			{onDismiss ? (
				<button
					type="button"
					onClick={onDismiss}
					className="rounded p-1 text-current/65 transition hover:bg-current/10 hover:text-current"
					aria-label="알림 닫기"
				>
					<X className="h-3.5 w-3.5" aria-hidden="true" />
				</button>
			) : null}
		</div>
	);
}
