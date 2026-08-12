import type { HTMLAttributes } from "react";
import { surfaceClassName } from "./surfaceClassName";

export function Surface({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return <div className={surfaceClassName(className)} {...props} />;
}
