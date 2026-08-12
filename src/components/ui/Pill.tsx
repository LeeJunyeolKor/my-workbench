import type { HTMLAttributes } from "react";
import { cn } from "#/lib/cn";

const defaultToneClassNames = {
	neutral:
		"border-black/5 bg-zinc-100/70 text-zinc-600 dark:border-white/10 dark:bg-white/10 dark:text-zinc-300",
	blue: "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
	amber:
		"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
	green:
		"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
	violet:
		"border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
	red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
};

const statusToneClassNames = {
	neutral:
		"border-[#d0d7de] bg-[#f6f8fa] text-[#57606a] dark:border-[#30363d] dark:bg-[#21262d] dark:text-[#c9d1d9]",
	blue: "border-[#54aeff]/35 bg-[#ddf4ff] text-[#0969da] dark:border-[#58a6ff]/40 dark:bg-[#102a43] dark:text-[#79c0ff]",
	amber:
		"border-[#d4a72c]/35 bg-[#fff8c5] text-[#9a6700] dark:border-[#d29922]/45 dark:bg-[#3d2f12] dark:text-[#f2cc60]",
	green:
		"border-[#4ac26b]/35 bg-[#dafbe1] text-[#1a7f37] dark:border-[#3fb950]/40 dark:bg-[#103d2a] dark:text-[#7ee787]",
	violet:
		"border-[#a475f9]/35 bg-[#fbefff] text-[#8250df] dark:border-[#a371f7]/45 dark:bg-[#2d2147] dark:text-[#d2a8ff]",
	red: "border-[#ff8182]/35 bg-[#ffebe9] text-[#cf222e] dark:border-[#f85149]/45 dark:bg-[#3d1719] dark:text-[#ff7b72]",
};

const variantClassNames = {
	default: {
		base: "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
		tones: defaultToneClassNames,
	},
	status: {
		base: "inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold leading-5",
		tones: statusToneClassNames,
	},
};

type PillProps = HTMLAttributes<HTMLSpanElement> & {
	tone?: PillTone;
	variant?: PillVariant;
};

export type PillTone = keyof typeof defaultToneClassNames;
export type PillVariant = keyof typeof variantClassNames;

export function Pill({
	className,
	tone = "neutral",
	variant = "default",
	...props
}: PillProps) {
	const variantClasses = variantClassNames[variant];

	return (
		<span
			className={cn(variantClasses.base, variantClasses.tones[tone], className)}
			{...props}
		/>
	);
}
