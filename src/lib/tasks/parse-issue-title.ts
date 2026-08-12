const ISSUE_LINE = /^([A-Z][A-Z0-9]+-\d+)\s*[—-]\s*(.+)$/;
const PARENT_SUFFIX = /\s*\(↑\s*([A-Z][A-Z0-9]+-\d+)\)\s*$/;

export type ParsedIssueTitle = {
	issueKey: string | null;
	summary: string;
	parentKey: string | null;
};

export function parseIssueTitle(title: string): ParsedIssueTitle {
	const match = title.match(ISSUE_LINE);
	if (!match) {
		return { issueKey: null, summary: title, parentKey: null };
	}

	let summary = match[2];
	let parentKey: string | null = null;
	const parentMatch = summary.match(PARENT_SUFFIX);
	if (parentMatch) {
		parentKey = parentMatch[1];
		summary = summary.replace(PARENT_SUFFIX, "").trim();
	}

	return { issueKey: match[1], summary, parentKey };
}
