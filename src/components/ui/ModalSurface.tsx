import type { HTMLAttributes } from "react";
import { cn } from "#/lib/cn";
import { surfaceClassName } from "./surfaceClassName";

export function modalSurfaceClassName(className?: string) {
	return surfaceClassName(
		cn(
			"w-full overflow-hidden rounded-2xl flex flex-col max-h-[90vh] transition-all",
			className,
		),
	);
}

export function ModalSurface({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			role="dialog"
			aria-modal="true"
			className={modalSurfaceClassName(className)}
			{...props}
		/>
	);
}
