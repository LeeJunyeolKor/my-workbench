import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	type AgentSessionInfo,
	type AgentSessionMatchInput,
	type AgentSessionType,
	buildAgentSessionCommand,
	parseAgentSessionContent,
} from "#/lib/agent-sessions";
import { WORKBENCH_DATA } from "#/server/paths";

const MAX_FILES_PER_SOURCE = 300;
const MAX_FILE_BYTES = 2_000_000;
const LARGE_FILE_EDGE_BYTES = 1_000_000;
const SESSION_ID_RE =
	/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function walkFiles(
	root: string,
	predicate: (filePath: string) => boolean,
): Promise<string[]> {
	const results: string[] = [];

	async function visit(dir: string) {
		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const nextPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await visit(nextPath);
			} else if (entry.isFile() && predicate(nextPath)) {
				results.push(nextPath);
			}
		}
	}

	await visit(root);
	return results;
}

export function pickRecentSessionFiles(
	files: Array<{ filePath: string; mtimeMs: number }>,
	limit = MAX_FILES_PER_SOURCE,
) {
	return [...files]
		.sort(
			(a, b) => b.mtimeMs - a.mtimeMs || a.filePath.localeCompare(b.filePath),
		)
		.slice(0, limit)
		.map((file) => file.filePath);
}

async function pickRecentSessionFilePaths(
	files: string[],
	limit = MAX_FILES_PER_SOURCE,
) {
	const filesWithStats = await Promise.all(
		files.map(async (filePath) => ({
			filePath,
			mtimeMs: (await fs.stat(filePath).catch(() => null))?.mtimeMs ?? 0,
		})),
	);
	return pickRecentSessionFiles(filesWithStats, limit);
}

async function readSmallFile(filePath: string) {
	try {
		const stat = await fs.stat(filePath);
		if (stat.size > MAX_FILE_BYTES) {
			const handle = await fs.open(filePath, "r");
			try {
				const head = Buffer.alloc(LARGE_FILE_EDGE_BYTES);
				const headRead = await handle.read(head, 0, LARGE_FILE_EDGE_BYTES, 0);
				const tailSize = Math.min(LARGE_FILE_EDGE_BYTES, stat.size);
				const tail = Buffer.alloc(tailSize);
				const tailRead = await handle.read(
					tail,
					0,
					tailSize,
					stat.size - tailSize,
				);

				return [
					head.subarray(0, headRead.bytesRead).toString("utf8"),
					'{"sample_truncated":true}',
					tail.subarray(0, tailRead.bytesRead).toString("utf8"),
				].join("\n");
			} finally {
				await handle.close();
			}
		}
		return await fs.readFile(filePath, "utf8");
	} catch {
		return null;
	}
}

function extractSessionIdFromPath(filePath: string) {
	return path.basename(filePath).match(SESSION_ID_RE)?.[0] ?? null;
}

async function readCodexSessionTitles(home: string) {
	const indexPath = path.join(home, ".codex", "session_index.jsonl");
	const content = await readSmallFile(indexPath);
	const titles = new Map<string, string>();
	if (!content) return titles;

	for (const line of content.split("\n")) {
		try {
			const parsed = JSON.parse(line) as {
				id?: unknown;
				thread_name?: unknown;
			};
			if (
				typeof parsed.id === "string" &&
				typeof parsed.thread_name === "string" &&
				parsed.thread_name.trim()
			) {
				titles.set(parsed.id, parsed.thread_name);
			}
		} catch {
			// Ignore malformed index rows.
		}
	}

	return titles;
}

async function parseSessionFiles(
	agentType: AgentSessionType,
	files: string[],
	match: AgentSessionMatchInput,
	sessionTitleForPath?: (filePath: string) => string | null,
) {
	const sessions: AgentSessionInfo[] = [];
	for (const filePath of files) {
		const content = await readSmallFile(filePath);
		if (!content) continue;
		const stat = await fs.stat(filePath).catch(() => null);

		const session = parseAgentSessionContent({
			agentType,
			transcriptPath: filePath,
			sessionTitle: sessionTitleForPath?.(filePath),
			content,
			match,
			transcriptMtime: stat?.mtime.toISOString() ?? null,
		});
		if (session) sessions.push(session);
	}
	return sessions;
}

async function readWorkbenchSession(match: AgentSessionMatchInput) {
	const filePath = path.join(
		WORKBENCH_DATA,
		`chat_history_${match.taskKey}.json`,
	);
	const content = await readSmallFile(filePath);
	if (!content) return [];
	const stat = await fs.stat(filePath).catch(() => null);

	const session = parseAgentSessionContent({
		agentType: "my-workbench",
		transcriptPath: filePath,
		content,
		match,
		transcriptMtime: stat?.mtime.toISOString() ?? null,
	});
	return session ? [session] : [];
}

export async function findAgentSessionsForTask(
	match: AgentSessionMatchInput,
): Promise<AgentSessionInfo[]> {
	const home = os.homedir();
	const [
		cursorFileCandidates,
		codexFileCandidates,
		claudeFileCandidates,
		codexTitles,
	] = await Promise.all([
		walkFiles(
			path.join(home, ".cursor", "projects"),
			(filePath) =>
				filePath.includes(`${path.sep}agent-transcripts${path.sep}`) &&
				filePath.endsWith(".jsonl"),
		),
		walkFiles(path.join(home, ".codex", "sessions"), (filePath) =>
			filePath.endsWith(".jsonl"),
		),
		walkFiles(path.join(home, ".claude", "projects"), (filePath) =>
			filePath.endsWith(".jsonl"),
		),
		readCodexSessionTitles(home),
	]);

	const [cursorFiles, codexFiles, claudeFiles] = await Promise.all([
		pickRecentSessionFilePaths(cursorFileCandidates),
		pickRecentSessionFilePaths(codexFileCandidates),
		pickRecentSessionFilePaths(claudeFileCandidates),
	]);

	const [cursor, codex, claude, workbench] = await Promise.all([
		parseSessionFiles("cursor", cursorFiles, match),
		parseSessionFiles("codex", codexFiles, match, (filePath) => {
			const sessionId = extractSessionIdFromPath(filePath);
			return sessionId ? (codexTitles.get(sessionId) ?? null) : null;
		}),
		parseSessionFiles("claude", claudeFiles, match),
		readWorkbenchSession(match),
	]);

	return [...cursor, ...codex, ...claude, ...workbench]
		.sort((a, b) => {
			if (a.score !== b.score) return b.score - a.score;
			return (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? "");
		})
		.slice(0, 12);
}

export async function openAgentSessionImpl(input: {
	agentType: AgentSessionType;
	sessionId?: string | null;
	cwd?: string | null;
}) {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execFileAsync = promisify(execFile);
	const command = buildAgentSessionCommand(input);
	const script = [
		'tell application "Terminal"',
		"activate",
		`do script ${JSON.stringify(command)}`,
		"end tell",
	];

	await execFileAsync(
		"osascript",
		script.flatMap((line) => ["-e", line]),
	);
	return { ok: true as const };
}
