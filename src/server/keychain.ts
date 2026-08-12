"use server";

import { createServerFn } from "@tanstack/react-start";

async function getExecFileAsync() {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	return promisify(execFile);
}

const keychainAgentTypes = new Set(["gemini", "claude", "codex"]);
const KEYCHAIN_ACCOUNT = "MyWorkbenchAI";
const KEYCHAIN_SERVICE_PREFIX = "my_workbench";

type KeychainAgentType = "gemini" | "claude" | "codex";

type ApiKeyAgentInput = {
	agentType: KeychainAgentType;
};

type ApiKeySaveInput = ApiKeyAgentInput & {
	apiKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseAgentType(value: unknown): KeychainAgentType {
	if (typeof value !== "string") {
		throw new Error("지원하지 않는 API Key 대상입니다.");
	}

	const agentType = value.trim();
	if (!keychainAgentTypes.has(agentType)) {
		throw new Error("지원하지 않는 API Key 대상입니다.");
	}

	return agentType as KeychainAgentType;
}

export function parseApiKeyAgentInput(data: unknown): ApiKeyAgentInput {
	if (!isRecord(data)) {
		throw new Error("API Key 대상 입력 형식이 올바르지 않습니다.");
	}

	return {
		agentType: parseAgentType(data.agentType),
	};
}

export function parseApiKeySaveInput(data: unknown): ApiKeySaveInput {
	if (!isRecord(data)) {
		throw new Error("API Key 입력 형식이 올바르지 않습니다.");
	}

	const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
	if (!apiKey) {
		throw new Error("API Key가 입력되지 않았습니다.");
	}

	return {
		agentType: parseAgentType(data.agentType),
		apiKey,
	};
}

export function keychainErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return String(error);
}

export function getKeychainIdentity(agentType: string) {
	return {
		account: KEYCHAIN_ACCOUNT,
		service: `${KEYCHAIN_SERVICE_PREFIX}_${agentType}_api_key`,
	};
}

/**
 * Keychain helper to retrieve API Key on the server side (internal helper).
 */
export async function getApiKeyFromKeychain(
	agentType: string,
): Promise<string | null> {
	try {
		const execFileAsync = await getExecFileAsync();
		const identity = getKeychainIdentity(agentType);
		const { stdout } = await execFileAsync("security", [
			"find-generic-password",
			"-a",
			identity.account,
			"-s",
			identity.service,
			"-w",
		]);
		return stdout ? stdout.trim() : null;
	} catch {
		// security command returns non-zero exit code if not found
		return null;
	}
}

/**
 * Server function to save API Key to macOS keychain.
 */
export const saveApiKeyToKeychainFn = createServerFn({ method: "POST" })
	.inputValidator(parseApiKeySaveInput)
	.handler(async ({ data }) => {
		try {
			const execFileAsync = await getExecFileAsync();
			const identity = getKeychainIdentity(data.agentType);
			await execFileAsync("security", [
				"add-generic-password",
				"-a",
				identity.account,
				"-s",
				identity.service,
				"-w",
				data.apiKey,
				"-U",
			]);
			return { ok: true as const };
		} catch (err) {
			console.error("Failed to save password to macOS keychain:", err);
			throw new Error(`macOS 키체인 저장 실패: ${keychainErrorMessage(err)}`);
		}
	});

/**
 * Server function to delete API Key from macOS keychain.
 */
export const deleteApiKeyFromKeychainFn = createServerFn({ method: "POST" })
	.inputValidator(parseApiKeyAgentInput)
	.handler(async ({ data }) => {
		try {
			const execFileAsync = await getExecFileAsync();
			const identity = getKeychainIdentity(data.agentType);
			await execFileAsync("security", [
				"delete-generic-password",
				"-a",
				identity.account,
				"-s",
				identity.service,
			]);
			return { ok: true as const };
		} catch {
			// If it doesn't exist, ignore error and return success
			return { ok: true as const };
		}
	});

/**
 * Server function to check if an API Key exists in macOS keychain.
 */
export const checkApiKeyInKeychainFn = createServerFn({ method: "POST" })
	.inputValidator(parseApiKeyAgentInput)
	.handler(async ({ data }) => {
		try {
			const execFileAsync = await getExecFileAsync();
			const identity = getKeychainIdentity(data.agentType);
			await execFileAsync("security", [
				"find-generic-password",
				"-a",
				identity.account,
				"-s",
				identity.service,
			]);
			return { exists: true as const };
		} catch {
			return { exists: false as const };
		}
	});
