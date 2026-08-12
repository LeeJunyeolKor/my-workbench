import { marked } from "marked";
import type { PlanSummary, PlanTocEntry } from "#/lib/plans/types";

const ACCENTS = [
	"var(--workbench-accent-green)",
	"var(--workbench-accent-purple)",
	"var(--workbench-accent-blue)",
	"var(--workbench-accent-orange)",
	"var(--workbench-accent-yellow)",
] as const;

export function slugifyHeading(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w가-힣]+/g, "-")
		.replace(/^-|-$/g, "");
}

export function accentForTaskId(taskId: string): string {
	let hash = 0;
	for (const char of taskId) {
		hash = (hash + char.charCodeAt(0)) % ACCENTS.length;
	}
	return ACCENTS[hash] ?? ACCENTS[0];
}

export function extractTitle(content: string): string {
	const match = content.match(/^#\s+(.+)$/m);
	return match?.[1]?.trim() ?? "Untitled plan";
}

export function countCheckboxProgress(content: string): {
	done: number;
	total: number;
} {
	const lines = content.split("\n");
	let done = 0;
	let total = 0;
	for (const line of lines) {
		if (/^- \[[xX]\]/.test(line)) {
			done += 1;
			total += 1;
		} else if (/^- \[ \]/.test(line)) {
			total += 1;
		}
	}
	return { done, total };
}

export function extractMetadata(content: string): {
	repo?: string;
	issueUrl?: string;
} {
	const metadata: { repo?: string; issueUrl?: string } = {};
	const section = content.match(/##\s*메타데이터[\s\S]*?(?=\n##\s|\n---\n|$)/i);
	if (!section) return metadata;

	const block = section[0];
	const repoMatch = block.match(
		/(?:^|\n)\s*[-*]\s*(?:\*\*)?레포(?:\*\*)?:?\s*[`"]?([^`\n"]+)/im,
	);
	if (repoMatch) metadata.repo = repoMatch[1].trim();

	const issueMatch = block.match(
		/https?:\/\/[^\s)]+\/browse\/([A-Z][A-Z0-9]+-\d+)/i,
	);
	if (issueMatch) metadata.issueUrl = issueMatch[0].replace(/\)$/, "");

	return metadata;
}

export function extractToc(content: string): PlanTocEntry[] {
	const entries: PlanTocEntry[] = [];
	for (const line of content.split("\n")) {
		const match = line.match(/^(#{2,3})\s+(.+)$/);
		if (!match) continue;
		const text = match[2].replace(/\*\*/g, "").trim();
		entries.push({
			level: match[1].length,
			text,
			id: slugifyHeading(text),
		});
	}
	return entries;
}

export function summarizePlan(
	taskId: string,
	content: string,
	modifiedAt: Date,
): PlanSummary {
	const { done, total } = countCheckboxProgress(content);
	const metadata = extractMetadata(content);

	return {
		taskId,
		title: extractTitle(content),
		progressDone: done,
		progressTotal: total,
		modifiedAt: modifiedAt.toISOString(),
		accent: accentForTaskId(taskId),
		repo: metadata.repo,
		issueUrl: metadata.issueUrl,
	};
}

export function renderPlanHtml(content: string): string {
	const renderer = new marked.Renderer();

	renderer.heading = ({ text, depth }) => {
		const plain = text.replace(/<[^>]+>/g, "");
		const id = slugifyHeading(plain);
		return `<h${depth} id="${id}">${text}</h${depth}>\n`;
	};

	renderer.code = ({ text, lang }) => {
		if (lang === "mermaid") {
			return `<pre class="mermaid">${text}</pre>\n`;
		}
		const escapedLang = lang ?? "";
		return `<pre><code class="language-${escapedLang}">${text}</code></pre>\n`;
	};

	return marked.parse(content, {
		gfm: true,
		breaks: false,
		renderer,
	}) as string;
}
