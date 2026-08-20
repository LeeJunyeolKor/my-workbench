import { describe, expect, it } from "vitest";
import {
	countCheckboxProgress,
	extractMetadata,
	extractTitle,
	extractToc,
	renderPlanHtml,
	summarizePlan,
} from "#/lib/plans/parser";

const SAMPLE = `# DEMO-103: webpack exclude

## 메타데이터
- 작업: https://issues.example.test/browse/DEMO-103
- 레포: apps/web-app

## 구현 계획

- [x] dev build
- [ ] prod build

## 테스트

### unit
`;

describe("extractTitle", () => {
	it("reads first h1", () => {
		expect(extractTitle(SAMPLE)).toBe("DEMO-103: webpack exclude");
	});
});

describe("countCheckboxProgress", () => {
	it("counts task checkboxes", () => {
		expect(countCheckboxProgress(SAMPLE)).toEqual({ done: 1, total: 2 });
	});
});

describe("extractMetadata", () => {
	it("parses repo and issue URL", () => {
		expect(extractMetadata(SAMPLE)).toEqual({
			repo: "apps/web-app",
			issueUrl: "https://issues.example.test/browse/DEMO-103",
		});
	});
});

describe("extractToc", () => {
	it("collects h2/h3 headings", () => {
		const toc = extractToc(SAMPLE);
		expect(toc.map((entry) => entry.text)).toContain("구현 계획");
		expect(toc.some((entry) => entry.level === 3)).toBe(true);
	});
});

describe("renderPlanHtml", () => {
	it("adds heading ids for anchors", () => {
		const html = renderPlanHtml("## Hello World\n\nBody");
		expect(html).toContain('id="hello-world"');
	});

	it("renders raw HTML and executable URLs as inert text", () => {
		const html = renderPlanHtml(`## <img src=x onerror="alert(1)">

<script>alert(1)</script>

[unsafe](javascript:alert(1))

![unsafe image](data:text/html;base64,PHNjcmlwdD4=)

\`\`\`mermaid
<img src=x onerror="alert(1)">
\`\`\`
`);

		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img src=x");
		expect(html).not.toMatch(/(?:href|src)="(?:javascript|data):/i);
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).toContain(
			'<pre class="mermaid">&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</pre>',
		);
	});

	it("keeps supported links and images", () => {
		const html = renderPlanHtml(
			"[docs](https://example.test?a=1&b=2) ![diagram](./diagram.png)",
		);

		expect(html).toContain('href="https://example.test?a=1&amp;b=2"');
		expect(html).toContain('src="./diagram.png"');
	});
});

describe("summarizePlan", () => {
	it("builds card summary", () => {
		const summary = summarizePlan(
			"DEMO-103",
			SAMPLE,
			new Date("2026-05-28T00:00:00Z"),
		);
		expect(summary.taskId).toBe("DEMO-103");
		expect(summary.progressDone).toBe(1);
		expect(summary.repo).toBe("apps/web-app");
	});
});
