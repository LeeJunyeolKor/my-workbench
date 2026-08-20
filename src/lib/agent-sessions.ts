export type AgentSessionType = "cursor" | "codex" | "claude";

export type AgentSessionInfo = {
	agentType: AgentSessionType;
	sessionId: string;
	title: string | null;
	summary: string | null;
	lastUserMessage: string | null;
	transcriptPath: string;
	cwd: string | null;
	branch: string | null;
	lastActiveAt: string | null;
	score: number;
	matchReasons: string[];
	canResume: boolean;
};

export type AgentSessionMatchInput = {
	taskKey: string;
	taskAliases?: string[];
	branches?: string[];
	reviews?: Array<{ id: string; url?: string }>;
	repoPaths?: string[];
	commitHashes?: string[];
	keywords?: string[];
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function unique(values: string[]) {
	return Array.from(new Set(values));
}

function basename(pathname: string) {
	return pathname.split("/").filter(Boolean).at(-1) ?? pathname;
}

function stripJsonl(filename: string) {
	return filename.replace(/\.jsonl$/, "").replace(/\.json$/, "");
}

function extractSessionId(transcriptPath: string, content: string) {
	const fileBase = stripJsonl(basename(transcriptPath));
	const fileUuid = fileBase.match(UUID_RE)?.[0];
	if (fileUuid) return fileUuid;

	for (const line of content.split("\n")) {
		try {
			const parsed = JSON.parse(line) as { sessionId?: unknown };
			if (typeof parsed.sessionId === "string" && parsed.sessionId) {
				return parsed.sessionId;
			}
		} catch {
			// Ignore non-JSON transcript fragments.
		}
	}

	return fileBase;
}

function extractCwd(content: string, repoPaths: string[] = []) {
	const matchedRepoPath = [...repoPaths]
		.filter(Boolean)
		.filter((repoPath) => content.includes(repoPath))
		.sort((a, b) => b.length - a.length)[0];
	if (matchedRepoPath) return matchedRepoPath;

	for (const line of content.split("\n")) {
		try {
			const parsed = JSON.parse(line) as { cwd?: unknown; payload?: unknown };
			if (typeof parsed.cwd === "string" && parsed.cwd) return parsed.cwd;

			if (
				isRecord(parsed.payload) &&
				typeof parsed.payload.cwd === "string" &&
				parsed.payload.cwd
			) {
				return parsed.payload.cwd;
			}
		} catch {
			// fall through to text regex below
		}
	}

	const cdMatch = content.match(/cd\s+(['"]?)(\/[^&"']+)\1\s+&&/);
	return cdMatch?.[2]?.trim() ?? null;
}

function extractBranch(content: string, branches: string[] = []) {
	for (const line of content.split("\n")) {
		try {
			const parsed = JSON.parse(line) as { gitBranch?: unknown };
			if (typeof parsed.gitBranch === "string" && parsed.gitBranch) {
				return parsed.gitBranch;
			}
		} catch {
			// fall through to exact branch list below
		}
	}

	return branches.find((branch) => content.includes(branch)) ?? null;
}

function extractLastActiveAt(content: string) {
	let last: string | null = null;
	for (const line of content.split("\n")) {
		try {
			const parsed = JSON.parse(line) as { timestamp?: unknown };
			if (typeof parsed.timestamp === "string" && parsed.timestamp) {
				last = parsed.timestamp;
			}
		} catch {
			// Ignore malformed transcript lines.
		}
	}
	return last;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCodexSubagentSession(content: string): boolean {
	for (const line of content.split("\n")) {
		try {
			const parsed = JSON.parse(line) as unknown;
			if (!isRecord(parsed)) continue;

			const payload = isRecord(parsed.payload) ? parsed.payload : parsed;
			if (payload.thread_source === "subagent") return true;

			const source = payload.source;
			if (isRecord(source) && isRecord(source.subagent)) return true;
		} catch {
			// Ignore malformed transcript lines.
		}
	}
	return false;
}

function cleanSessionText(value: string | null | undefined): string | null {
	const requestMarker = "## My request for Codex:";
	const requestIndex = value?.indexOf(requestMarker) ?? -1;
	const withoutAttachmentPreamble =
		requestIndex >= 0
			? value?.slice(requestIndex + requestMarker.length)
			: value?.replace(/# Files mentioned by the user:[\s\S]*$/g, " ");

	const cleaned = withoutAttachmentPreamble
		?.replace(/<image[\s\S]*?<\/image>/g, " ")
		.replace(/<image[^>]*>/g, " ")
		.replace(/\[Image\]\s*<image_files>[\s\S]*$/g, " ")
		.replace(/\[Image\]\s*The following images[\s\S]*$/g, " ")
		.replace(/<\/?user_query>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned || null;
}

function shorten(value: string | null, maxLength: number): string | null {
	if (!value) return null;
	const chars = Array.from(value);
	if (chars.length <= maxLength) return value;
	return `${chars.slice(0, maxLength - 3).join("")}...`;
}

function collectTextFragments(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(collectTextFragments);
	if (!isRecord(value)) return [];

	const fragments: string[] = [];
	if (typeof value.text === "string") fragments.push(value.text);
	if ("content" in value)
		fragments.push(...collectTextFragments(value.content));
	return fragments;
}

function collectCommandFragments(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(collectCommandFragments);
	if (!isRecord(value)) return [];

	const fragments: string[] = [];
	if (typeof value.command === "string") fragments.push(value.command);
	if (
		isRecord(value.input) &&
		typeof value.input.command === "string" &&
		value.input.command
	) {
		fragments.push(value.input.command);
	}
	if ("content" in value) {
		fragments.push(...collectCommandFragments(value.content));
	}
	return fragments;
}

function getMessageRole(parsed: unknown): string | null {
	if (!isRecord(parsed)) return null;
	if (typeof parsed.role === "string") return parsed.role;

	const payload = parsed.payload;
	if (isRecord(payload) && typeof payload.role === "string") {
		return payload.role;
	}
	return null;
}

function getMessageContent(parsed: unknown): unknown {
	if (!isRecord(parsed)) return null;

	const message = parsed.message;
	if (isRecord(message) && "content" in message) return message.content;

	const payload = parsed.payload;
	if (isRecord(payload) && "content" in payload) return payload.content;

	return "content" in parsed ? parsed.content : null;
}

function isUsefulUserMessage(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return false;

	const noisyPrefixes = [
		"# AGENTS.md instructions",
		"<environment_context>",
		"<permissions instructions>",
		"<app-context>",
		"<skills_instructions>",
		"<plugins_instructions>",
		"The following is the Codex agent history",
		"Reviewed Codex session id:",
		">>> TRANSCRIPT DELTA",
		">>> APPROVAL REQUEST",
	];

	return !noisyPrefixes.some((prefix) => trimmed.startsWith(prefix));
}

function extractMetadataSearchFragments(parsed: unknown): string[] {
	if (!isRecord(parsed)) return [];

	const payload = isRecord(parsed.payload) ? parsed.payload : parsed;
	const fragments: string[] = [];
	if (typeof payload.cwd === "string") fragments.push(payload.cwd);
	if (typeof payload.gitBranch === "string") fragments.push(payload.gitBranch);
	return fragments;
}

function buildSearchableSessionContent(content: string): string {
	const fragments: string[] = [];

	for (const line of content.split("\n")) {
		try {
			const parsed = JSON.parse(line) as unknown;
			const role = getMessageRole(parsed);

			if (role === "user" || role === "assistant") {
				const messageContent = getMessageContent(parsed);
				const text = cleanSessionText(
					collectTextFragments(messageContent).join(" "),
				);
				if (text && (role !== "user" || isUsefulUserMessage(text))) {
					fragments.push(text);
				}
				fragments.push(...collectCommandFragments(messageContent));
				continue;
			}

			fragments.push(...extractMetadataSearchFragments(parsed));
		} catch {
			// Ignore malformed transcript lines.
		}
	}

	return fragments
		.map((fragment) => cleanSessionText(fragment))
		.filter((fragment): fragment is string => Boolean(fragment))
		.join("\n");
}

function extractUserMessages(content: string): string[] {
	const messages: string[] = [];
	for (const line of content.split("\n")) {
		try {
			const parsed = JSON.parse(line) as unknown;
			if (getMessageRole(parsed) !== "user") continue;

			const text = cleanSessionText(
				collectTextFragments(getMessageContent(parsed)).join(" "),
			);
			if (text && isUsefulUserMessage(text)) messages.push(text);
		} catch {
			// Ignore malformed transcript lines.
		}
	}
	return messages;
}

function extractSessionText(content: string, sessionTitle?: string | null) {
	const userMessages = extractUserMessages(content);
	const firstUserMessage = userMessages[0] ?? null;
	const lastUserMessage = userMessages.at(-1) ?? null;
	const title = shorten(cleanSessionText(sessionTitle) ?? firstUserMessage, 90);
	const summarySource =
		lastUserMessage && lastUserMessage !== title
			? lastUserMessage
			: firstUserMessage;

	return {
		title,
		summary: shorten(summarySource, 160),
		lastUserMessage: shorten(lastUserMessage, 160),
	};
}

function scoreSession(content: string, match: AgentSessionMatchInput) {
	const contentLower = content.toLowerCase();
	const reasons: string[] = [];
	let score = 0;

	for (const taskKey of unique([match.taskKey, ...(match.taskAliases ?? [])])) {
		if (contentLower.includes(taskKey.toLowerCase())) {
			score += 100;
			reasons.push(`task ${taskKey}`);
		}
	}

	for (const branch of match.branches ?? []) {
		if (!branch) continue;
		if (contentLower.includes(branch.toLowerCase())) {
			score += 80;
			reasons.push(`branch ${branch}`);
		}
	}

	for (const review of match.reviews ?? []) {
		if (review.url && contentLower.includes(review.url.toLowerCase())) {
			score += 80;
			reasons.push(`review ${review.id}`);
			continue;
		}
		const reviewPatterns = [
			`review ${review.id}`,
			`PR #${review.id}`,
			`MR !${review.id}`,
			`#${review.id}`,
		];
		if (
			reviewPatterns.some((pattern) =>
				contentLower.includes(pattern.toLowerCase()),
			)
		) {
			score += 60;
			reasons.push(`review ${review.id}`);
		}
	}

	for (const repoPath of match.repoPaths ?? []) {
		if (repoPath && contentLower.includes(repoPath.toLowerCase())) {
			score += 15;
			reasons.push(`repo ${repoPath}`);
		}
	}

	for (const commitHash of match.commitHashes ?? []) {
		if (commitHash && contentLower.includes(commitHash.toLowerCase())) {
			score += 50;
			reasons.push(`commit ${commitHash.slice(0, 8)}`);
		}
	}

	for (const keyword of match.keywords ?? []) {
		if (keyword && contentLower.includes(keyword.toLowerCase())) {
			score += 5;
			reasons.push(`keyword ${keyword}`);
		}
	}

	return { score, reasons: unique(reasons) };
}

export function parseAgentSessionContent(input: {
	agentType: AgentSessionType;
	transcriptPath: string;
	sessionTitle?: string | null;
	content: string;
	match: AgentSessionMatchInput;
	transcriptMtime?: string | null;
}): AgentSessionInfo | null {
	if (input.agentType === "codex" && isCodexSubagentSession(input.content)) {
		return null;
	}

	const searchableContent = buildSearchableSessionContent(input.content);
	const { score, reasons } = scoreSession(searchableContent, input.match);
	if (score < 40) return null;

	const sessionId = extractSessionId(input.transcriptPath, input.content);
	const cwd = extractCwd(input.content, input.match.repoPaths);
	const sessionText = extractSessionText(input.content, input.sessionTitle);

	return {
		agentType: input.agentType,
		sessionId,
		title: sessionText.title,
		summary: sessionText.summary,
		lastUserMessage: sessionText.lastUserMessage,
		transcriptPath: input.transcriptPath,
		cwd,
		branch: extractBranch(searchableContent, input.match.branches),
		lastActiveAt:
			extractLastActiveAt(input.content) ?? input.transcriptMtime ?? null,
		score,
		matchReasons: reasons,
		canResume: Boolean(sessionId),
	};
}

export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildAgentSessionCommand(input: {
	agentType: AgentSessionType;
	sessionId?: string | null;
	cwd?: string | null;
}): string {
	const cwd = input.cwd || process.cwd();
	const quotedCwd = shellQuote(cwd);
	const sessionId = input.sessionId ? shellQuote(input.sessionId) : null;

	if (input.agentType === "cursor") {
		return sessionId
			? `cd ${quotedCwd} && agent --workspace ${quotedCwd} --resume ${sessionId}`
			: `cd ${quotedCwd} && agent`;
	}

	if (input.agentType === "claude") {
		return sessionId
			? `cd ${quotedCwd} && claude --resume ${sessionId}`
			: `cd ${quotedCwd} && claude`;
	}

	if (input.agentType === "codex") {
		return sessionId
			? `codex resume ${sessionId} --cd ${quotedCwd}`
			: `cd ${quotedCwd} && codex`;
	}

	return `cd ${quotedCwd}`;
}
