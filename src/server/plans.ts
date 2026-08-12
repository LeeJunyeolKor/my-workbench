"use server";

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { getErrorMessage } from "#/lib/errors";
import {
	buildPlanWorkContext,
	extractPlanWorkHints,
} from "#/lib/plans/context";
import { orderPlanFiles } from "#/lib/plans/order";
import {
	countCheckboxProgress,
	extractTitle,
	extractToc,
	renderPlanHtml,
	summarizePlan,
} from "#/lib/plans/parser";
import { isValidTaskId, planDirPath } from "#/lib/plans/paths";
import type { PlanDetail } from "#/lib/plans/types";
import {
	getPlansDir,
	normalizePlansDir,
	PLAN_SETTINGS_FILE,
	WORKBENCH_DATA,
} from "#/server/paths";
import { readPlanFileOrder, savePlanFileOrder } from "#/server/plan-file-order";
import { readPlanSummaries } from "#/server/plan-read";
import { findAgentSessionsForTask } from "./agent-sessions";
import { getConfiguredBranches } from "./branch-links";
import { getApiKeyFromKeychain } from "./keychain";

type GeminiGenerateContentResponse = {
	candidates?: Array<{
		content?: {
			parts?: Array<{
				text?: string;
			}>;
		};
	}>;
};

type ClaudeMessageResponse = {
	content?: Array<{
		text?: string;
	}>;
};

type OpenAIChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
};

type AgentProcessMap = Map<
	string,
	{ child: ChildProcessWithoutNullStreams; targetPath: string }
>;

const PLAN_AI_AGENT_TYPES = ["gemini", "claude", "cursor", "codex"] as const;
const planAiAgentTypes = new Set<string>(PLAN_AI_AGENT_TYPES);

type PlanAiAgentType = (typeof PLAN_AI_AGENT_TYPES)[number];

type PlanAiEditComment = {
	selectedText: string;
	comment: string;
};

type ModifyPlanWithAIInput = {
	taskId: string;
	filename: string;
	instruction?: string;
	comments?: PlanAiEditComment[];
	agentType: PlanAiAgentType;
	cliPath: string;
};

type SendChatMessageInput = {
	taskId: string;
	message: string;
	selectedText?: string;
	filename: string;
	agentType: PlanAiAgentType;
	cliPath: string;
};

type ChatHistoryInput = {
	taskId: string;
};

type ApproveChatChangeInput = ChatHistoryInput & {
	approve: boolean;
};

type SavePlanFileOrderInput = {
	taskId: string;
	filenames: string[];
};

type SavePlanFileInput = {
	taskId: string;
	filename: string;
	content: string;
};

async function getSpawnAsync() {
	const { spawn } = await import("node:child_process");
	return spawn;
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	label: string,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout>;
	const timeoutPromise = new Promise<T>((_, reject) => {
		timeout = setTimeout(() => {
			reject(new Error(`${label} 조회 시간이 초과되었습니다.`));
		}, timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]).finally(() =>
		clearTimeout(timeout),
	);
}

export const listPlans = createServerFn({ method: "GET" }).handler(
	readPlanSummaries,
);

function parsePlanSettingsInput(data: unknown): { plansDir: string } {
	if (
		!data ||
		typeof data !== "object" ||
		typeof (data as { plansDir?: unknown }).plansDir !== "string"
	) {
		throw new Error("구현 계획 위치를 입력해 주세요.");
	}
	return { plansDir: (data as { plansDir: string }).plansDir };
}

function assertInputRecord(
	data: unknown,
	message: string,
): Record<string, unknown> {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new Error(message);
	}
	return data as Record<string, unknown>;
}

function parseRequiredString(value: unknown, message: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(message);
	}
	return value.trim();
}

function parsePlanTaskId(value: unknown): string {
	const taskId = parseRequiredString(value, "작업 ID를 입력해 주세요.");
	if (!isValidTaskId(taskId)) {
		throw new Error("올바르지 않은 작업 ID입니다.");
	}
	return taskId;
}

function parsePlanMarkdownFilename(value: unknown): string {
	const filename = parseRequiredString(
		value,
		"구현 계획 파일명을 입력해 주세요.",
	);
	const normalized = path.normalize(filename);
	if (
		path.isAbsolute(normalized) ||
		normalized === ".." ||
		normalized.startsWith(`..${path.sep}`)
	) {
		throw new Error("잘못된 접근 경로입니다 (Path traversal 차단).");
	}
	if (!normalized.endsWith(".md")) {
		throw new Error("마크다운 파일(.md)만 사용할 수 있습니다.");
	}
	return normalized;
}

function parsePlanMarkdownFilenames(value: unknown): string[] {
	if (!Array.isArray(value)) {
		throw new Error("구현 계획 파일 목록 입력 형식이 올바르지 않습니다.");
	}
	return value.map(parsePlanMarkdownFilename);
}

function parsePlanFileContent(value: unknown): string {
	if (typeof value !== "string") {
		throw new Error("구현 계획 파일 내용 입력 형식이 올바르지 않습니다.");
	}
	return value;
}

function parseOptionalString(
	value: unknown,
	message: string,
): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") {
		throw new Error(message);
	}
	const trimmed = value.trim();
	return trimmed || undefined;
}

function parseCliPath(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value !== "string") {
		throw new Error("CLI 경로 입력 형식이 올바르지 않습니다.");
	}
	return value.trim();
}

function parsePlanAiAgentType(value: unknown): PlanAiAgentType {
	if (typeof value !== "string") {
		throw new Error("지원하지 않는 AI 에이전트입니다.");
	}
	const agentType = value.trim();
	if (!planAiAgentTypes.has(agentType)) {
		throw new Error("지원하지 않는 AI 에이전트입니다.");
	}
	return agentType as PlanAiAgentType;
}

function parseAiEditComments(value: unknown): PlanAiEditComment[] | undefined {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value)) {
		throw new Error("AI 수정 코멘트 형식이 올바르지 않습니다.");
	}

	const comments = value.map((comment) => {
		const record = assertInputRecord(
			comment,
			"AI 수정 코멘트 형식이 올바르지 않습니다.",
		);
		return {
			selectedText: parseRequiredString(
				record.selectedText,
				"AI 수정 코멘트 형식이 올바르지 않습니다.",
			),
			comment: parseRequiredString(
				record.comment,
				"AI 수정 코멘트 형식이 올바르지 않습니다.",
			),
		};
	});

	return comments.length > 0 ? comments : undefined;
}

export function parseChatHistoryInput(data: unknown): ChatHistoryInput {
	const record = assertInputRecord(
		data,
		"채팅 히스토리 입력 형식이 올바르지 않습니다.",
	);

	return {
		taskId: parsePlanTaskId(record.taskId),
	};
}

export function parseApproveChatChangeInput(
	data: unknown,
): ApproveChatChangeInput {
	const record = assertInputRecord(
		data,
		"채팅 승인 입력 형식이 올바르지 않습니다.",
	);
	if (typeof record.approve !== "boolean") {
		throw new Error("승인 여부 입력 형식이 올바르지 않습니다.");
	}

	return {
		taskId: parsePlanTaskId(record.taskId),
		approve: record.approve,
	};
}

export function parseSavePlanFileOrderInput(
	data: unknown,
): SavePlanFileOrderInput {
	const record = assertInputRecord(
		data,
		"구현 계획 파일 정렬 입력 형식이 올바르지 않습니다.",
	);

	return {
		taskId: parsePlanTaskId(record.taskId),
		filenames: parsePlanMarkdownFilenames(record.filenames),
	};
}

export function parseSavePlanFileInput(data: unknown): SavePlanFileInput {
	const record = assertInputRecord(
		data,
		"구현 계획 파일 저장 입력 형식이 올바르지 않습니다.",
	);

	return {
		taskId: parsePlanTaskId(record.taskId),
		filename: parsePlanMarkdownFilename(record.filename),
		content: parsePlanFileContent(record.content),
	};
}

export function parseModifyPlanWithAIInput(
	data: unknown,
): ModifyPlanWithAIInput {
	const record = assertInputRecord(
		data,
		"AI 수정 요청 입력 형식이 올바르지 않습니다.",
	);

	return {
		taskId: parsePlanTaskId(record.taskId),
		filename: parseRequiredString(
			record.filename,
			"구현 계획 파일명을 입력해 주세요.",
		),
		instruction: parseOptionalString(
			record.instruction,
			"수정 지시 입력 형식이 올바르지 않습니다.",
		),
		comments: parseAiEditComments(record.comments),
		agentType: parsePlanAiAgentType(record.agentType),
		cliPath: parseCliPath(record.cliPath),
	};
}

export function parseSendChatMessageInput(data: unknown): SendChatMessageInput {
	const record = assertInputRecord(
		data,
		"채팅 메시지 입력 형식이 올바르지 않습니다.",
	);

	return {
		taskId: parsePlanTaskId(record.taskId),
		message: parseRequiredString(record.message, "메시지를 입력해 주세요."),
		selectedText: parseOptionalString(
			record.selectedText,
			"선택 영역 입력 형식이 올바르지 않습니다.",
		),
		filename: parseRequiredString(
			record.filename,
			"구현 계획 파일명을 입력해 주세요.",
		),
		agentType: parsePlanAiAgentType(record.agentType),
		cliPath: parseCliPath(record.cliPath),
	};
}

export const savePlanSettings = createServerFn({ method: "POST" })
	.inputValidator(parsePlanSettingsInput)
	.handler(async ({ data }) => {
		const plansDir = normalizePlansDir(data.plansDir);
		await fs.mkdir(path.dirname(PLAN_SETTINGS_FILE), { recursive: true });
		await fs.writeFile(
			PLAN_SETTINGS_FILE,
			`${JSON.stringify({ plansDir }, null, 2)}\n`,
			"utf8",
		);
		return { plansDir };
	});

export const getPlanSettings = createServerFn({ method: "GET" }).handler(
	async () => ({ plansDir: getPlansDir() }),
);

async function getMarkdownFilesRecursive(
	dir: string,
	baseDir: string = dir,
): Promise<{ filename: string; fullPath: string }[]> {
	const results: { filename: string; fullPath: string }[] = [];
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const resPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.startsWith(".")) continue;
				const subFiles = await getMarkdownFilesRecursive(resPath, baseDir);
				results.push(...subFiles);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				const relativePath = path.relative(baseDir, resPath);
				results.push({
					filename: relativePath,
					fullPath: resPath,
				});
			}
		}
	} catch (err) {
		console.error("Failed to read directory recursively", dir, err);
	}
	return results;
}

export const getPlan = createServerFn({ method: "GET" })
	.inputValidator((data: { taskId: string }) => data)
	.handler(async ({ data }): Promise<PlanDetail | null> => {
		const dirPath = planDirPath(data.taskId);
		if (!dirPath) return null;

		try {
			const mdFiles = await getMarkdownFilesRecursive(dirPath);
			if (mdFiles.length === 0) return null;

			const filesData = await Promise.all(
				mdFiles.map(async ({ filename, fullPath }) => {
					const content = await fs.readFile(fullPath, "utf8");
					const stat = await fs.stat(fullPath);

					const { done, total } = countCheckboxProgress(content);
					const title = extractTitle(content);
					const html = renderPlanHtml(content);
					const toc = extractToc(content);

					return {
						filename,
						title,
						content,
						html,
						toc,
						progressDone: done,
						progressTotal: total,
						mtime: stat.mtime,
					};
				}),
			);

			const savedOrder = await readPlanFileOrder(data.taskId);
			const orderedFilesData = orderPlanFiles(filesData, savedOrder);
			const workHints = extractPlanWorkHints(
				orderedFilesData.map(({ filename, content }) => ({
					filename,
					content,
				})),
			);

			// 대표 메타데이터 수집 (기본 plan.md 기준, 없으면 첫번째 파일 기준)
			const primaryFile =
				orderedFilesData.find((f) => f.filename === "plan.md") ||
				orderedFilesData[0];
			const primaryContent = primaryFile.content;

			const summary = summarizePlan(
				data.taskId,
				primaryContent,
				primaryFile.mtime,
			);

			let workContext = buildPlanWorkContext({
				taskKey: data.taskId,
				workHints,
			});
			try {
				const { getWorktreesCached } = await import("./worktree-cache");
				const [worktreesResult, branchesResult] = await Promise.allSettled([
					withTimeout(getWorktreesCached(), 2500, "워크트리"),
					withTimeout(getConfiguredBranches(), 2500, "브랜치"),
				]);
				const worktrees =
					worktreesResult.status === "fulfilled"
						? worktreesResult.value.worktrees
						: [];
				const branches =
					branchesResult.status === "fulfilled" ? branchesResult.value : [];
				const preliminaryContext = buildPlanWorkContext({
					taskKey: data.taskId,
					workHints,
					worktrees,
					branches,
				});
				const agentSessions = await withTimeout(
					findAgentSessionsForTask({
						taskKey: data.taskId,
						taskAliases: workHints.taskKeys,
						branches: Array.from(
							new Set([
								...preliminaryContext.relatedBranches.map(
									(branch) => branch.normalizedBranch,
								),
								...workHints.branches,
							]),
						),
						reviews: [],
						repoPaths: Array.from(
							new Set([
								...preliminaryContext.relatedBranches
									.map((branch) => branch.repoPath)
									.filter(Boolean),
								...preliminaryContext.relatedWorktrees
									.map((worktree) => worktree.repoPath)
									.filter(Boolean),
								...workHints.repoPaths,
							]),
						),
						commitHashes: preliminaryContext.relatedWorktrees.map(
							(worktree) => worktree.commitHash,
						),
						keywords: summary.title
							? [summary.title, ...workHints.taskKeys]
							: workHints.taskKeys,
					}),
					2500,
					"에이전트 세션",
				).catch(() => []);

				workContext = buildPlanWorkContext({
					taskKey: data.taskId,
					workHints,
					worktrees,
					branches,
					agentSessions,
				});
			} catch (err) {
				console.error("Failed to get plan work context", data.taskId, err);
			}

			return {
				taskId: data.taskId,
				title: summary.title,
				modifiedAt: summary.modifiedAt,
				accent: summary.accent,
				repo: summary.repo,
				issueUrl: summary.issueUrl,
				files: orderedFilesData.map(
					({
						filename,
						title,
						content,
						html,
						toc,
						progressDone,
						progressTotal,
					}) => ({
						filename,
						title,
						content,
						html,
						toc,
						progressDone,
						progressTotal,
					}),
				),
				worktrees: workContext.relatedWorktrees,
				branches: workContext.relatedBranches,
				agentSessions: workContext.relatedAgentSessions,
			};
		} catch (e) {
			console.error("Failed to getPlan for", data.taskId, e);
			return null;
		}
	});

export const savePlanFileOrderFn = createServerFn({ method: "POST" })
	.inputValidator(parseSavePlanFileOrderInput)
	.handler(async ({ data }) => {
		const dirPath = planDirPath(data.taskId);
		if (!dirPath) throw new Error("구현 계획 디렉토리를 찾을 수 없습니다.");

		for (const filename of data.filenames) {
			const targetPath = path.join(dirPath, filename);
			const relative = path.relative(dirPath, targetPath);
			if (relative.startsWith("..") || path.isAbsolute(relative)) {
				throw new Error("잘못된 접근 경로입니다 (Path traversal 차단).");
			}
			if (!filename.endsWith(".md")) {
				throw new Error("마크다운 파일(.md)만 정렬할 수 있습니다.");
			}
		}

		await savePlanFileOrder(data.taskId, data.filenames);
		return { ok: true as const };
	});

function cleanMarkdownResponse(text: string): string {
	let cleaned = text.trim();
	// Strip starting ```markdown or ```
	cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\n/, "");
	// Strip trailing ```
	cleaned = cleaned.replace(/\n```$/, "");
	return cleaned.trim();
}

export const savePlanFileFn = createServerFn({ method: "POST" })
	.inputValidator(parseSavePlanFileInput)
	.handler(async ({ data }) => {
		const dirPath = planDirPath(data.taskId);
		if (!dirPath) throw new Error("구현 계획 디렉토리를 찾을 수 없습니다.");

		const targetPath = path.join(dirPath, data.filename);
		const relative = path.relative(dirPath, targetPath);

		if (relative.startsWith("..") || path.isAbsolute(relative)) {
			throw new Error("잘못된 접근 경로입니다 (Path traversal 차단).");
		}
		if (!data.filename.endsWith(".md")) {
			throw new Error("마크다운 파일(.md)만 편집이 가능합니다.");
		}

		await fs.writeFile(targetPath, data.content, "utf8");
		return { success: true };
	});

export const modifyPlanWithAIFn = createServerFn({ method: "POST" })
	.inputValidator(parseModifyPlanWithAIInput)
	.handler(async ({ data }) => {
		const dirPath = planDirPath(data.taskId);
		if (!dirPath) throw new Error("구현 계획 디렉토리를 찾을 수 없습니다.");

		const targetPath = path.join(dirPath, data.filename);
		const relative = path.relative(dirPath, targetPath);
		if (relative.startsWith("..") || path.isAbsolute(relative)) {
			throw new Error("잘못된 접근 경로입니다 (Path traversal 차단).");
		}

		const content = await fs.readFile(targetPath, "utf8");

		// Combine multiple comments or standard instruction
		let combinedInstruction = "";
		if (data.comments && data.comments.length > 0) {
			combinedInstruction = data.comments
				.map(
					(c, idx) =>
						`[수정 지시 ${idx + 1}] "${c.selectedText}" 구절 -> ${c.comment}`,
				)
				.join("\n");
		} else {
			combinedInstruction = data.instruction || "";
		}

		const escapedInstruction = combinedInstruction.replace(/"/g, '\\"');
		let execSuccess = false;
		let modifiedResult = "";

		// 1. Try Headless CLI first
		try {
			let cmd = "";
			if (data.agentType === "gemini") {
				cmd = `"${data.cliPath || "gemini"}" -p "${escapedInstruction}" "${targetPath}"`;
			} else if (data.agentType === "claude") {
				cmd = `"${data.cliPath || "claude"}" -p "${escapedInstruction}" --file "${targetPath}"`;
			} else if (data.agentType === "codex") {
				cmd = `"${data.cliPath || "codex"}" --instruction "${escapedInstruction}" --file "${targetPath}"`;
			} else if (data.agentType === "cursor") {
				cmd = `"${data.cliPath || "agent"}" --yolo --trust --approve-mcps -p "${escapedInstruction}" "${targetPath}"`;
			}

			if (cmd) {
				console.log("[AI Edit] Executing local CLI", {
					agentType: data.agentType,
					commentCount: data.comments?.length ?? 0,
					filename: data.filename,
					hasInstruction: Boolean(data.instruction?.trim()),
				});
				const { exec } = await import("node:child_process");
				await new Promise<void>((resolve, reject) => {
					const child = exec(cmd);

					// Drain streams without mirroring prompt or file content to server logs.
					child.stdout?.on("data", () => {});
					child.stderr?.on("data", () => {});

					child.on("close", (code) => {
						if (code === 0) {
							resolve();
						} else {
							reject(
								new Error(
									`CLI 프로세스가 에러 코드(${code})로 종료되었습니다.`,
								),
							);
						}
					});
				});
				execSuccess = true;
				// Read file content back
				modifiedResult = await fs.readFile(targetPath, "utf8");
			}
		} catch (cliErr) {
			console.warn(`Headless CLI run failed, falling back to API:`, cliErr);
		}

		if (execSuccess) {
			return {
				content: modifiedResult,
				mode: "cli" as const,
			};
		}

		// 2. Fallback: Cloud API / Local Popup
		if (data.agentType === "cursor") {
			// Cursor Fallback: Create prompt file & open in Cursor Editor
			await fs.mkdir(WORKBENCH_DATA, { recursive: true });
			const promptPath = path.join(
				WORKBENCH_DATA,
				`cursor_prompt_${data.taskId}.md`,
			);
			const promptContent = `# Cursor AI Edit Request

아래 [기존 파일 경로]의 문서 내용을 읽고, [편집 지시사항]에 따라 문서를 알맞게 수정해주세요.

[기존 파일 경로]
${targetPath}

[편집 지시사항]
${combinedInstruction}
`;
			await fs.writeFile(promptPath, promptContent, "utf8");

			// Attempt to launch cursor command to open prompt file (non-blocking)
			try {
				const spawnCmd = await getSpawnAsync();
				const child = spawnCmd("cursor", [promptPath], {
					detached: true,
					stdio: "ignore",
				});
				child.unref();
			} catch (launchErr) {
				console.error("Failed to launch cursor command:", launchErr);
			}

			return {
				content: `[Local Prompt Created] ${promptPath}`,
				mode: "popup" as const,
			};
		}

		// Retrieve API key from process environment first to avoid a Keychain prompt.
		let apiKey = "";

		if (data.agentType === "gemini") apiKey = process.env.GEMINI_API_KEY || "";
		if (data.agentType === "claude")
			apiKey = process.env.ANTHROPIC_API_KEY || "";
		if (data.agentType === "codex")
			apiKey = process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY || "";

		// Fallback to macOS Keychain ONLY if not found in env
		if (!apiKey) {
			apiKey = (await getApiKeyFromKeychain(data.agentType)) || "";
		}

		if (!apiKey) {
			throw new Error(
				`로컬 Headless CLI 실행에 실패했으나, ${data.agentType} API Key가 키체인이나 환경 변수 파일에 존재하지 않아 클라우드 API 호출 폴백에 실패했습니다.`,
			);
		}

		let promptBody = "";
		if (data.comments && data.comments.length > 0) {
			promptBody = `사용자는 본문의 특정 구절(선택 텍스트)에 코멘트 형태로 수정 지시를 남겼습니다. 본문에 해당 구절을 찾아 코멘트 내용을 정확하게 적용하여 문서를 업데이트해야 합니다.

[수정 요청 사항 (코멘트 목록)]
`;
			data.comments.forEach((c, idx) => {
				promptBody += `\n${idx + 1}. 선택 영역: "${c.selectedText}"\n   수정 지시: ${c.comment}\n`;
			});
		} else {
			promptBody = `[편집 지시사항]
${combinedInstruction}`;
		}

		const systemPrompt = `당신은 테크니컬 마크다운 문서 전문 에디터입니다.
기존 마크다운 문서 내용과 사용자의 편집 지시사항을 분석하여, 지시사항이 본문에 충실히 반영된 새로운 마크다운 문서를 작성해주세요.
응답 시 어떠한 부연 설명이나 설명 텍스트, 코드 블록 기호(예: \`\`\`markdown)도 넣지 말고, 오직 완성된 순수 마크다운 본문만 그대로 반환해야 합니다.

[기존 마크다운 내용]
${content}

${promptBody}`;

		// Call Cloud APIs via fetch
		try {
			if (data.agentType === "gemini") {
				const response = await fetch(
					`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							contents: [{ parts: [{ text: systemPrompt }] }],
						}),
					},
				);
				if (!response.ok) {
					throw new Error(
						`Gemini HTTP ${response.status}: ${await response.text()}`,
					);
				}
				const resJson =
					(await response.json()) as GeminiGenerateContentResponse;
				const rawText =
					resJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
				return {
					content: cleanMarkdownResponse(rawText),
					mode: "api" as const,
				};
			}

			if (data.agentType === "claude") {
				const response = await fetch(`https://api.anthropic.com/v1/messages`, {
					method: "POST",
					headers: {
						"x-api-key": apiKey,
						"anthropic-version": "2023-06-01",
						"content-type": "application/json",
					},
					body: JSON.stringify({
						model: "claude-3-5-sonnet-latest",
						max_tokens: 8192,
						messages: [{ role: "user", content: systemPrompt }],
					}),
				});
				if (!response.ok) {
					throw new Error(
						`Claude HTTP ${response.status}: ${await response.text()}`,
					);
				}
				const resJson = (await response.json()) as ClaudeMessageResponse;
				const rawText = resJson.content?.[0]?.text ?? "";
				return {
					content: cleanMarkdownResponse(rawText),
					mode: "api" as const,
				};
			}

			if (data.agentType === "codex") {
				const response = await fetch(
					`https://api.openai.com/v1/chat/completions`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${apiKey}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: "gpt-4o-mini",
							messages: [{ role: "user", content: systemPrompt }],
						}),
					},
				);
				if (!response.ok) {
					throw new Error(
						`OpenAI HTTP ${response.status}: ${await response.text()}`,
					);
				}
				const resJson = (await response.json()) as OpenAIChatCompletionResponse;
				const rawText = resJson.choices?.[0]?.message?.content ?? "";
				return {
					content: cleanMarkdownResponse(rawText),
					mode: "api" as const,
				};
			}
		} catch (apiErr) {
			console.error(`Cloud API fallback execution failed:`, apiErr);
			throw new Error(
				`Headless CLI 실행 실패 후 클라우드 API 호출 시도 중 오류가 발생했습니다: ${getErrorMessage(apiErr, String(apiErr))}`,
			);
		}

		throw new Error("알 수 없는 에이전트 종류입니다.");
	});

const globalWithProcessMap = globalThis as typeof globalThis & {
	workbenchProcessMap?: AgentProcessMap;
};
if (!globalWithProcessMap.workbenchProcessMap) {
	globalWithProcessMap.workbenchProcessMap = new Map();
}
const processMap = globalWithProcessMap.workbenchProcessMap;

export interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	selectedText?: string;
}

export interface ChatHistory {
	chatId: string;
	status: "idle" | "running" | "waiting_approval" | "completed" | "error";
	messages: ChatMessage[];
	liveLog: string;
	actionType?: "file_edit" | "command_exec" | "tool_call";
	actionDetail?: string;
	errorMsg?: string;
}

const CHAT_STATUSES = [
	"idle",
	"running",
	"waiting_approval",
	"completed",
	"error",
] as const;

function defaultChatHistory(): ChatHistory {
	return {
		chatId: "",
		status: "idle",
		messages: [],
		liveLog: "",
	};
}

function isChatMessage(value: unknown): value is ChatMessage {
	if (!value || typeof value !== "object") return false;

	const message = value as Partial<ChatMessage>;
	return (
		(message.role === "user" ||
			message.role === "assistant" ||
			message.role === "system") &&
		typeof message.content === "string" &&
		(message.selectedText === undefined ||
			typeof message.selectedText === "string")
	);
}

export function normalizeChatHistory(value: unknown): ChatHistory {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return defaultChatHistory();
	}

	const history = value as Partial<ChatHistory>;
	if (
		typeof history.chatId !== "string" ||
		!CHAT_STATUSES.includes(history.status as ChatHistory["status"]) ||
		!Array.isArray(history.messages) ||
		typeof history.liveLog !== "string"
	) {
		return defaultChatHistory();
	}

	return {
		chatId: history.chatId,
		status: history.status as ChatHistory["status"],
		messages: history.messages.filter(isChatMessage),
		liveLog: history.liveLog,
		actionType:
			history.actionType === "file_edit" ||
			history.actionType === "command_exec" ||
			history.actionType === "tool_call"
				? history.actionType
				: undefined,
		actionDetail:
			typeof history.actionDetail === "string"
				? history.actionDetail
				: undefined,
		errorMsg:
			typeof history.errorMsg === "string" ? history.errorMsg : undefined,
	};
}

function getChatHistoryPath(taskId: string): string {
	return path.join(WORKBENCH_DATA, `chat_history_${taskId}.json`);
}

async function readChatHistory(taskId: string): Promise<ChatHistory> {
	const filePath = getChatHistoryPath(taskId);
	try {
		const data = await fs.readFile(filePath, "utf8");
		return normalizeChatHistory(JSON.parse(data));
	} catch {
		return defaultChatHistory();
	}
}

async function writeChatHistory(taskId: string, history: ChatHistory) {
	const filePath = getChatHistoryPath(taskId);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, JSON.stringify(history, null, 2), "utf8");
}

export const getChatHistoryFn = createServerFn({ method: "GET" })
	.inputValidator(parseChatHistoryInput)
	.handler(async ({ data }) => {
		return await readChatHistory(data.taskId);
	});

export const sendChatMessageFn = createServerFn({ method: "POST" })
	.inputValidator(parseSendChatMessageInput)
	.handler(async ({ data }) => {
		const dirPath = planDirPath(data.taskId);
		if (!dirPath) throw new Error("구현 계획 디렉토리를 찾을 수 없습니다.");

		const targetPath = path.join(dirPath, data.filename);
		const relative = path.relative(dirPath, targetPath);
		if (relative.startsWith("..") || path.isAbsolute(relative)) {
			throw new Error("잘못된 접근 경로입니다 (Path traversal 차단).");
		}

		const history = await readChatHistory(data.taskId);

		// 1. 에이전트 CLI Chat ID 초기화
		if (!history.chatId) {
			if (data.agentType === "cursor") {
				const { exec } = await import("node:child_process");
				const { promisify } = await import("node:util");
				const execAsync = promisify(exec);
				try {
					const createCmd = `"${data.cliPath || "agent"}" create-chat`;
					const { stdout } = await execAsync(createCmd);
					history.chatId = stdout.trim();
				} catch (err) {
					console.error("Failed to create agent chat id:", err);
					// Fallback 임시 ID 생성
					history.chatId =
						crypto.randomUUID?.() ||
						Math.random().toString(36).substring(2, 15);
				}
			} else {
				// gemini, claude, codex 등도 공통 chatId 부여
				history.chatId =
					crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15);
			}
		}

		// 2. 메시지 추가 및 상태 갱신
		history.messages.push({
			role: "user",
			content: data.message,
			selectedText: data.selectedText,
		});
		history.status = "running";
		history.liveLog = "";
		delete history.actionType;
		delete history.actionDetail;
		delete history.errorMsg;
		await writeChatHistory(data.taskId, history);

		// 3. 비동기로 에이전트 프로세스 구동
		let cmd = "";
		const escapedMessage = data.message.replace(/"/g, '\\"');

		// 로컬 CLI 명령어 구성
		if (data.agentType === "cursor") {
			cmd = `"${data.cliPath || "agent"}" --yolo --trust --approve-mcps --resume ${history.chatId} "${escapedMessage}"`;
		} else {
			// gemini, claude, codex는 stateless 로컬 CLI에 chat memory를 주입하여 전달
			let contextPrompt = `이전 대화 기록:\n`;
			history.messages.forEach((msg) => {
				contextPrompt += `- ${msg.role === "user" ? "User" : "Agent"}: ${msg.content}\n`;
			});
			contextPrompt += `\n[현재 요청 사항]\n${data.message}`;
			if (data.selectedText) {
				contextPrompt += `\n(참고: 본문 선택 영역: "${data.selectedText}")`;
			}
			const escapedContext = contextPrompt.replace(/"/g, '\\"');

			if (data.agentType === "gemini") {
				cmd = `"${data.cliPath || "gemini"}" -p "${escapedContext}" "${targetPath}"`;
			} else if (data.agentType === "claude") {
				cmd = `"${data.cliPath || "claude"}" -p "${escapedContext}" --file "${targetPath}"`;
			} else if (data.agentType === "codex") {
				cmd = `"${data.cliPath || "codex"}" --instruction "${escapedContext}" --file "${targetPath}"`;
			}
		}

		if (!cmd) {
			throw new Error("올바르지 않은 에이전트 유형입니다.");
		}

		// 기존 진행 중인 프로세스가 있다면 정리
		const existing = processMap.get(data.taskId);
		if (existing) {
			try {
				existing.child.kill();
			} catch {}
			processMap.delete(data.taskId);
		}

		console.log("[Chat Agent] Spawning command", {
			agentType: data.agentType,
			filename: data.filename,
			taskId: data.taskId,
		});
		const { spawn } = await import("node:child_process");
		// spawn 형태로 구동하여 표준 입출력 제어 가능하게 함
		const child = spawn(cmd, { shell: true });

		processMap.set(data.taskId, { child, targetPath });

		// 비동기로 stdout / stderr 처리 시작
		let stdoutBuffer = "";

		child.stdout?.on("data", async (chunk) => {
			const text = chunk.toString();
			stdoutBuffer += text;

			// 실시간 로그 누적 업데이트
			const currentHistory = await readChatHistory(data.taskId);
			currentHistory.liveLog += text;

			// stdout 대기 패턴 감지 (예: y/n 승인 질문 등)
			const isWaiting =
				/Proceed\?|Apply\?|\(y\/n\)|Confirm\?|수정할까요|실행할까요|승인/gi.test(
					stdoutBuffer,
				);
			if (isWaiting && currentHistory.status !== "waiting_approval") {
				currentHistory.status = "waiting_approval";

				// 어떤 승인인지 분류
				if (
					/npm run|pnpm|npm|yarn|bundle|make|cargo|python/gi.test(stdoutBuffer)
				) {
					currentHistory.actionType = "command_exec";
					const cmdMatch =
						stdoutBuffer.match(/(?:run|execute|command)?\s*`([^`]+)`/i) ||
						stdoutBuffer.match(/(pnpm|npm|yarn|node)\s+[^\s]+/gi);
					currentHistory.actionDetail = cmdMatch
						? cmdMatch[0]
						: "쉘 명령어 실행";
				} else if (
					/read|write|file|save|patch|diff|edit/gi.test(stdoutBuffer)
				) {
					currentHistory.actionType = "file_edit";
					currentHistory.actionDetail = data.filename;
				} else {
					currentHistory.actionType = "tool_call";
					currentHistory.actionDetail = "에이전트 도구 호출";
				}
			}
			await writeChatHistory(data.taskId, currentHistory);
		});

		child.stderr?.on("data", async (chunk) => {
			const text = chunk.toString();
			const currentHistory = await readChatHistory(data.taskId);
			currentHistory.liveLog += text;
			await writeChatHistory(data.taskId, currentHistory);
		});

		child.on("close", async (code) => {
			processMap.delete(data.taskId);
			const currentHistory = await readChatHistory(data.taskId);

			if (code === 0) {
				currentHistory.status = "completed";
				// 에이전트의 답변을 messages에 기록
				const cleanResponse = stdoutBuffer.trim();
				if (cleanResponse) {
					currentHistory.messages.push({
						role: "assistant",
						content: cleanResponse,
					});
				}
			} else {
				// 강제 kill된 경우(거절 시)는 completed 처리하지 않고 idle로 롤백하거나 에러 처리
				if (currentHistory.status === "waiting_approval") {
					currentHistory.status = "idle";
				} else {
					currentHistory.status = "error";
					currentHistory.errorMsg = `에이전트가 에러 코드(${code})로 종료되었습니다.`;
				}
			}

			delete currentHistory.actionType;
			delete currentHistory.actionDetail;
			await writeChatHistory(data.taskId, currentHistory);
		});

		return { success: true };
	});

export const approveChatChangeFn = createServerFn({ method: "POST" })
	.inputValidator(parseApproveChatChangeInput)
	.handler(async ({ data }) => {
		const processInfo = processMap.get(data.taskId);
		if (!processInfo) {
			throw new Error("대기 중인 에이전트 프로세스를 찾을 수 없습니다.");
		}

		const history = await readChatHistory(data.taskId);
		history.status = "running";
		delete history.actionType;
		delete history.actionDetail;
		await writeChatHistory(data.taskId, history);

		if (data.approve) {
			console.log(
				`[Chat Agent] Writing 'y\\n' to stdin of process for task ${data.taskId}`,
			);
			processInfo.child.stdin?.write("y\n");
		} else {
			console.log(`[Chat Agent] Killing process for task ${data.taskId}`);
			try {
				processInfo.child.kill();
			} catch {}
			processMap.delete(data.taskId);

			const newHistory = await readChatHistory(data.taskId);
			newHistory.status = "idle";
			newHistory.messages.push({
				role: "system",
				content: "사용자가 승인을 거절하여 작업이 취소되었습니다.",
			});
			await writeChatHistory(data.taskId, newHistory);
		}

		return { success: true };
	});
