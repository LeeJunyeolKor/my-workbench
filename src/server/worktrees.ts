"use server";

import { createServerFn } from "@tanstack/react-start";
import type { AgentSessionType } from "#/lib/agent-sessions";
import type { WorktreeConfig } from "#/lib/worktree";

type CreateWorktreeInput = {
	repoPath: string;
	branchName: string;
	isNew: boolean;
	baseBranch?: string;
	customPath?: string;
};

type RemoveWorktreeInput = {
	path: string;
	force?: boolean;
};

type GetBranchesInput = {
	repoPath: string;
};

type GetWorktreesInput = {
	forceRefresh?: boolean;
};

type OpenInToolName = "cursor" | "claude" | "codex" | "antigravity";
type OpenInToolInput = {
	path: string;
	tool: OpenInToolName;
};

type OpenAgentSessionInput = {
	agentType: AgentSessionType;
	sessionId?: string;
	cwd?: string;
};

const openInToolNames = new Set<OpenInToolName>([
	"cursor",
	"claude",
	"codex",
	"antigravity",
]);
const agentSessionTypes = new Set<AgentSessionType>([
	"cursor",
	"codex",
	"claude",
	"my-workbench",
]);
const shellUnsafePattern = /["'`$\\\r\n]/;
const branchUnsafePattern = /["'`$\\\s;&|<>\r\n]/;

function readInputObject(
	data: unknown,
	message: string,
): Record<string, unknown> {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new Error(message);
	}
	return data as Record<string, unknown>;
}

function readRequiredString(value: unknown, message: string): string {
	if (typeof value !== "string") {
		throw new Error(message);
	}

	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(message);
	}

	return trimmed;
}

function readOptionalString(value: unknown): string | undefined {
	if (value == null) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new Error("워크트리 생성 입력 형식이 올바르지 않습니다.");
	}

	const trimmed = value.trim();
	return trimmed || undefined;
}

function readOptionalFieldString(
	value: unknown,
	message: string,
): string | undefined {
	if (value == null) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new Error(message);
	}

	const trimmed = value.trim();
	return trimmed || undefined;
}

export function parseWorktreeConfigInput(data: unknown): WorktreeConfig {
	const value = readInputObject(
		data,
		"워크트리 설정 형식이 올바르지 않습니다.",
	);
	const scanRoots = Array.isArray(value.scanRoots)
		? value.scanRoots.map((root) => {
				if (typeof root !== "string") {
					throw new Error("워크트리 스캔 경로를 입력해 주세요.");
				}
				return root.trim();
			})
		: [];
	const validScanRoots = scanRoots.filter(Boolean);
	if (validScanRoots.length === 0) {
		throw new Error("워크트리 스캔 경로를 입력해 주세요.");
	}

	if (typeof value.defaultWorktreeDir !== "string") {
		throw new Error("기본 워크트리 생성 위치를 입력해 주세요.");
	}

	const defaultWorktreeDir = value.defaultWorktreeDir.trim();
	if (!defaultWorktreeDir) {
		throw new Error("기본 워크트리 생성 위치를 입력해 주세요.");
	}

	return {
		scanRoots: validScanRoots,
		defaultWorktreeDir,
	};
}

export function parseCreateWorktreeInput(data: unknown): CreateWorktreeInput {
	const value = readInputObject(
		data,
		"워크트리 생성 입력 형식이 올바르지 않습니다.",
	);
	const repoPath = readRequiredString(
		value.repoPath,
		"워크트리를 생성할 저장소를 선택해 주세요.",
	);
	const branchName = readRequiredString(
		value.branchName,
		"워크트리를 생성할 브랜치를 입력해 주세요.",
	);

	if (branchUnsafePattern.test(branchName)) {
		throw new Error("브랜치 이름에 사용할 수 없는 문자가 있습니다.");
	}

	const baseBranch = readOptionalString(value.baseBranch);
	if (baseBranch && branchUnsafePattern.test(baseBranch)) {
		throw new Error("기준 브랜치 이름에 사용할 수 없는 문자가 있습니다.");
	}

	const customPath = readOptionalString(value.customPath);
	if (customPath && shellUnsafePattern.test(customPath)) {
		throw new Error("워크트리 저장 경로에 사용할 수 없는 문자가 있습니다.");
	}

	return {
		repoPath,
		branchName,
		isNew: value.isNew === true,
		...(baseBranch ? { baseBranch } : {}),
		...(customPath ? { customPath } : {}),
	};
}

export function parseGetBranchesInput(data: unknown): GetBranchesInput {
	const value = readInputObject(
		data,
		"브랜치 조회 입력 형식이 올바르지 않습니다.",
	);

	return {
		repoPath: readRequiredString(
			value.repoPath,
			"브랜치를 조회할 저장소를 선택해 주세요.",
		),
	};
}

export function parseGetWorktreesInput(data: unknown): GetWorktreesInput {
	if (data == null) {
		return {};
	}

	const value = readInputObject(
		data,
		"워크트리 조회 입력 형식이 올바르지 않습니다.",
	);
	if (value.forceRefresh == null) {
		return {};
	}
	if (typeof value.forceRefresh !== "boolean") {
		throw new Error("워크트리 새로고침 옵션 형식이 올바르지 않습니다.");
	}

	return { forceRefresh: value.forceRefresh };
}

export function parseRemoveWorktreeInput(data: unknown): RemoveWorktreeInput {
	const value = readInputObject(
		data,
		"워크트리 삭제 입력 형식이 올바르지 않습니다.",
	);
	const path = readRequiredString(
		value.path,
		"삭제할 워크트리 위치를 선택해 주세요.",
	);
	if (shellUnsafePattern.test(path)) {
		throw new Error("삭제할 워크트리 위치에 사용할 수 없는 문자가 있습니다.");
	}

	if (value.force != null && typeof value.force !== "boolean") {
		throw new Error("워크트리 강제 삭제 옵션 형식이 올바르지 않습니다.");
	}

	return {
		path,
		...(value.force === true ? { force: true } : {}),
	};
}

export function parseOpenInToolInput(data: unknown): OpenInToolInput {
	const value = readInputObject(
		data,
		"도구 실행 입력 형식이 올바르지 않습니다.",
	);
	const path = readRequiredString(value.path, "열 작업 위치를 선택해 주세요.");
	if (shellUnsafePattern.test(path)) {
		throw new Error("열 작업 위치에 사용할 수 없는 문자가 있습니다.");
	}

	if (typeof value.tool !== "string") {
		throw new Error("지원하지 않는 도구입니다.");
	}
	if (!openInToolNames.has(value.tool as OpenInToolName)) {
		throw new Error("지원하지 않는 도구입니다.");
	}

	return {
		path,
		tool: value.tool as OpenInToolName,
	};
}

export function parseOpenAgentSessionInput(
	data: unknown,
): OpenAgentSessionInput {
	const value = readInputObject(
		data,
		"에이전트 세션 실행 입력 형식이 올바르지 않습니다.",
	);
	if (
		typeof value.agentType !== "string" ||
		!agentSessionTypes.has(value.agentType as AgentSessionType)
	) {
		throw new Error("지원하지 않는 에이전트 세션입니다.");
	}

	const sessionId = readOptionalFieldString(
		value.sessionId,
		"에이전트 세션 ID 형식이 올바르지 않습니다.",
	);
	const cwd = readOptionalFieldString(
		value.cwd,
		"에이전트 작업 위치 형식이 올바르지 않습니다.",
	);

	return {
		agentType: value.agentType as AgentSessionType,
		...(sessionId ? { sessionId } : {}),
		...(cwd ? { cwd } : {}),
	};
}

export const getWorktreeConfig = createServerFn({ method: "GET" }).handler(
	async () => {
		const { ensureConfig } = await import("./worktree-impl");
		return await ensureConfig();
	},
);

export const saveWorktreeConfig = createServerFn({ method: "POST" })
	.inputValidator(parseWorktreeConfigInput)
	.handler(async ({ data }) => {
		const fs = await import("node:fs/promises");
		const { WORKTREE_CONFIG_FILE } = await import("./worktree-impl");
		const { invalidateWorktreeCache } = await import("./worktree-cache");
		const path = await import("node:path");

		await fs.mkdir(path.dirname(WORKTREE_CONFIG_FILE), { recursive: true });
		await fs.writeFile(
			WORKTREE_CONFIG_FILE,
			JSON.stringify(data, null, 2),
			"utf8",
		);
		invalidateWorktreeCache(); // scanRoots 변경 시 기존 스캔 결과 무효화
		return { ok: true as const };
	});

export const getWorktrees = createServerFn({ method: "GET" })
	.inputValidator(parseGetWorktreesInput)
	.handler(async ({ data }) => {
		const { getWorktreesCached } = await import("./worktree-cache");
		return await getWorktreesCached(data?.forceRefresh ?? false);
	});

export const getBranches = createServerFn({ method: "POST" })
	.inputValidator(parseGetBranchesInput)
	.handler(async ({ data }) => {
		const { getBranchesImpl } = await import("./worktree-impl");
		return await getBranchesImpl(data.repoPath);
	});

export const createWorktree = createServerFn({ method: "POST" })
	.inputValidator(parseCreateWorktreeInput)
	.handler(async ({ data }) => {
		const { createWorktreeImpl } = await import("./worktree-impl");
		const { invalidateWorktreeCache } = await import("./worktree-cache");
		const result = await createWorktreeImpl(data);
		invalidateWorktreeCache();
		return result;
	});

export const removeWorktree = createServerFn({ method: "POST" })
	.inputValidator(parseRemoveWorktreeInput)
	.handler(async ({ data }) => {
		const { removeWorktreeImpl } = await import("./worktree-impl");
		const { invalidateWorktreeCache } = await import("./worktree-cache");
		const result = await removeWorktreeImpl(data);
		invalidateWorktreeCache();
		return result;
	});

export const openInTool = createServerFn({ method: "POST" })
	.inputValidator(parseOpenInToolInput)
	.handler(async ({ data }) => {
		const { openInToolImpl } = await import("./worktree-impl");
		return await openInToolImpl(data);
	});

export const openAgentSession = createServerFn({ method: "POST" })
	.inputValidator(parseOpenAgentSessionInput)
	.handler(async ({ data }) => {
		const { openAgentSessionImpl } = await import("./agent-sessions");
		return await openAgentSessionImpl(data);
	});
