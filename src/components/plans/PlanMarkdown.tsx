import { useNavigate } from "@tanstack/react-router";
import { memo, useEffect, useRef, useState } from "react";
import { cn } from "#/lib/cn";

const PLAN_MARKDOWN_CLASSNAME =
	"prose prose-zinc plan-markdown max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-blue-600 dark:prose-a:text-blue-400";

type PlanMarkdownProps = {
	html: string;
	raw: string;
	currentFile?: string;
	onSelection?: (selectedText: string, rect: DOMRect) => void;
};

function resolveRelativePath(currentFile: string, href: string): string {
	if (href.startsWith("/") || href.includes("://") || href.startsWith("#")) {
		return href;
	}

	const parts = currentFile.split("/");
	parts.pop(); // remove filename to get directory path

	const hrefParts = href.split("/");
	for (const part of hrefParts) {
		if (part === "." || part === "") continue;
		if (part === "..") {
			parts.pop();
		} else {
			parts.push(part);
		}
	}
	return parts.join("/");
}

declare global {
	interface Window {
		mermaid?: {
			initialize: (config: Record<string, unknown>) => void;
			run: (options: { nodes: NodeListOf<Element> }) => Promise<void>;
		};
	}
}

const MERMAID_SRC =
	"https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

function loadMermaidScript(): Promise<void> {
	if (window.mermaid) return Promise.resolve();
	const existing = document.querySelector(`script[src="${MERMAID_SRC}"]`);
	if (existing) {
		return new Promise((resolve) => {
			existing.addEventListener("load", () => resolve(), { once: true });
		});
	}

	return new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = MERMAID_SRC;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error("Failed to load mermaid"));
		document.head.appendChild(script);
	});
}

export const PlanMarkdown = memo(function PlanMarkdown({
	html,
	raw,
	currentFile = "plan.md",
	onSelection,
}: PlanMarkdownProps) {
	const [showRaw, setShowRaw] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate({ from: "/plans/$taskId" });

	// biome-ignore lint/correctness/useExhaustiveDependencies: html changes replace the injected markdown content and must re-run Mermaid rendering
	useEffect(() => {
		if (showRaw || !contentRef.current) return;
		const nodes = contentRef.current.querySelectorAll("pre.mermaid");
		if (nodes.length === 0) return;

		let cancelled = false;
		loadMermaidScript()
			.then(() => {
				if (cancelled || !window.mermaid || !contentRef.current) return;
				window.mermaid.initialize({
					startOnLoad: false,
					theme: "dark",
					securityLevel: "strict",
				});
				return window.mermaid.run({
					nodes: contentRef.current.querySelectorAll("pre.mermaid"),
				});
			})
			.catch(() => {
				// mermaid optional — static pre remains
			});

		return () => {
			cancelled = true;
		};
	}, [html, showRaw]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: html changes replace heading anchors and must re-run hash scrolling
	useEffect(() => {
		if (showRaw || !contentRef.current) return;

		const timer = setTimeout(() => {
			const hash = window.location.hash;
			if (hash) {
				try {
					const decodedId = decodeURIComponent(hash.substring(1));
					const targetEl = contentRef.current?.querySelector(
						`[id="${decodedId}"]`,
					);
					if (targetEl) {
						targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
					}
				} catch (e) {
					console.error("Failed to scroll to hash anchor:", e);
				}
			}
		}, 150);

		return () => clearTimeout(timer);
	}, [html, showRaw]);

	useEffect(() => {
		if (showRaw || !contentRef.current) return;

		const contentElement = contentRef.current;
		const handleContentClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;

			const anchor = target.closest("a");
			if (!anchor) return;

			const href = anchor.getAttribute("href");
			if (!href) return;

			if (
				href.includes("://") ||
				href.startsWith("#") ||
				href.startsWith("mailto:") ||
				href.startsWith("tel:")
			) {
				return;
			}

			if (
				href.endsWith(".md") ||
				href.includes(".md#") ||
				href.includes(".md?")
			) {
				event.preventDefault();

				const cleanHref = href.split("#")[0].split("?")[0];
				const resolved = resolveRelativePath(currentFile, cleanHref);
				const hashMatch = href.match(/#.+$/);
				const hash = hashMatch ? hashMatch[0] : "";

				navigate({
					search: (prev) => ({ ...prev, file: resolved }),
					hash: hash ? hash.replace("#", "") : undefined,
				});
			}
		};

		contentElement.addEventListener("click", handleContentClick);
		return () => {
			contentElement.removeEventListener("click", handleContentClick);
		};
	}, [currentFile, navigate, showRaw]);

	const handlePointerUp = () => {
		if (!onSelection) return;
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) return;
		const selectedText = selection.toString().trim();
		if (!selectedText) return;

		if (containerRef.current?.contains(selection.anchorNode)) {
			const range = selection.getRangeAt(0);
			const rect = range.getBoundingClientRect();
			onSelection(selectedText, rect);
		}
	};

	return (
		<div ref={containerRef} onPointerUp={handlePointerUp}>
			<fieldset className="mb-4 flex gap-2 border-0 p-0">
				<legend className="sr-only">문서 보기 모드</legend>
				<button
					type="button"
					onClick={() => setShowRaw(false)}
					aria-pressed={!showRaw}
					className={`rounded-md px-3 py-1.5 text-sm font-semibold transition cursor-pointer select-none ${
						showRaw
							? "dark:text-zinc-400 dark:hover:text-zinc-200 text-zinc-500 hover:text-zinc-800 bg-transparent"
							: "dark:bg-zinc-800 dark:text-zinc-100 bg-zinc-100 text-zinc-900 shadow-sm border dark:border-white/5 border-black/5"
					}`}
				>
					미리보기
				</button>
				<button
					type="button"
					onClick={() => setShowRaw(true)}
					aria-pressed={showRaw}
					className={`rounded-md px-3 py-1.5 text-sm font-semibold transition cursor-pointer select-none ${
						showRaw
							? "dark:bg-zinc-800 dark:text-zinc-100 bg-zinc-100 text-zinc-900 shadow-sm border dark:border-white/5 border-black/5"
							: "dark:text-zinc-400 dark:hover:text-zinc-200 text-zinc-500 hover:text-zinc-800 bg-transparent"
					}`}
				>
					원문
				</button>
			</fieldset>

			{showRaw ? (
				<pre className="workbench-scrollbar overflow-x-auto rounded-xl border p-4 text-xs leading-relaxed bg-slate-50 text-slate-800 dark:bg-zinc-950 dark:border-zinc-800/80 dark:text-zinc-200">
					{raw}
				</pre>
			) : (
				<div
					ref={contentRef}
					className={cn(PLAN_MARKDOWN_CLASSNAME, "prose-headings:scroll-mt-24")}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted local plan.md rendered server-side
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			)}
		</div>
	);
});
