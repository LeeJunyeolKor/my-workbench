import { useServerFn } from "@tanstack/react-start";
import { Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ModalSurface } from "#/components/ui/ModalSurface";
import {
	type AgentType,
	isAgentType,
	persistAgentPreferences,
	readAgentPreferences,
} from "#/lib/agent-preferences";
import { getBrowserStorage } from "#/lib/browser-storage";
import { getErrorMessage } from "#/lib/errors";
import {
	checkApiKeyInKeychainFn,
	deleteApiKeyFromKeychainFn,
	saveApiKeyToKeychainFn,
} from "#/server/keychain";

type SettingsModalProps = {
	isOpen: boolean;
	onClose: () => void;
	onSave?: () => void;
};

const agents: Array<{ id: AgentType; label: string }> = [
	{ id: "gemini", label: "Gemini" },
	{ id: "claude", label: "Claude" },
	{ id: "cursor", label: "Cursor" },
	{ id: "codex", label: "Codex" },
];

export function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
	const [agentType, setAgentType] = useState<AgentType>("gemini");
	const [cursorCliPath, setCursorCliPath] = useState("agent");
	const [keys, setKeys] = useState<Record<AgentType, string>>({
		gemini: "",
		claude: "",
		cursor: "",
		codex: "",
	});
	const [keyExists, setKeyExists] = useState<Record<AgentType, boolean>>({
		gemini: false,
		claude: false,
		cursor: false,
		codex: false,
	});
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const checkKeychain = useServerFn(checkApiKeyInKeychainFn);
	const saveKeychain = useServerFn(saveApiKeyToKeychainFn);
	const deleteKeychain = useServerFn(deleteApiKeyFromKeychainFn);

	useEffect(() => {
		if (!isOpen) return;
		const preferences = readAgentPreferences(getBrowserStorage());
		setAgentType(preferences.agentType);
		setCursorCliPath(preferences.cursorCliPath);
		setKeys({ gemini: "", claude: "", cursor: "", codex: "" });
		setError(null);
		setSuccessMessage(null);

		let cancelled = false;
		Promise.all(
			agents.map(
				async ({ id }) =>
					[
						id,
						(await checkKeychain({ data: { agentType: id } })).exists,
					] as const,
			),
		)
			.then((entries) => {
				if (!cancelled)
					setKeyExists(
						Object.fromEntries(entries) as Record<AgentType, boolean>,
					);
			})
			.catch((cause) => {
				console.error(cause);
				if (!cancelled) setError("키체인 정보를 확인하지 못했습니다.");
			});
		return () => {
			cancelled = true;
		};
	}, [checkKeychain, isOpen]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && isOpen && !isLoading) onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isLoading, isOpen, onClose]);

	if (!isOpen) return null;

	const handleDeleteKey = async (target: AgentType) => {
		setIsLoading(true);
		setError(null);
		try {
			await deleteKeychain({ data: { agentType: target } });
			setKeyExists((current) => ({ ...current, [target]: false }));
			setKeys((current) => ({ ...current, [target]: "" }));
			setSuccessMessage(`${target} API Key를 제거했습니다.`);
		} catch (cause) {
			setError(getErrorMessage(cause, "API Key 삭제에 실패했습니다."));
		} finally {
			setIsLoading(false);
		}
	};

	const handleSave = async () => {
		setIsLoading(true);
		setError(null);
		setSuccessMessage(null);
		try {
			await Promise.all(
				agents.map(async ({ id }) => {
					const apiKey = keys[id].trim();
					if (!apiKey) return;
					await saveKeychain({ data: { agentType: id, apiKey } });
					setKeyExists((current) => ({ ...current, [id]: true }));
				}),
			);
			persistAgentPreferences(getBrowserStorage(), {
				agentType,
				cursorCliPath,
			});
			setKeys({ gemini: "", claude: "", cursor: "", codex: "" });
			setSuccessMessage("설정을 저장했습니다.");
			onSave?.();
			window.dispatchEvent(new Event("my-workbench-settings-updated"));
		} catch (cause) {
			setError(getErrorMessage(cause, "설정 저장에 실패했습니다."));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
			<ModalSurface className="max-w-xl">
				<header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
					<div>
						<h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
							<Settings className="h-5 w-5 text-zinc-500" />
							My Workbench 설정
						</h2>
						<p className="mt-0.5 text-xs text-zinc-550 dark:text-zinc-400">
							기본 에이전트와 로컬 자격 증명을 관리합니다.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						disabled={isLoading}
						aria-label="설정 닫기"
						className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
					>
						<X className="h-5 w-5" />
					</button>
				</header>

				<div className="max-h-[70vh] space-y-5 overflow-y-auto p-6 workbench-scrollbar">
					{error && (
						<p className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-650 dark:bg-red-950/20 dark:text-red-400">
							{error}
						</p>
					)}
					{successMessage && (
						<p className="rounded-lg bg-green-50 p-3 text-xs font-semibold text-green-650 dark:bg-green-950/20 dark:text-green-400">
							{successMessage}
						</p>
					)}

					<label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
						기본 AI 에이전트
						<select
							value={agentType}
							onChange={(event) =>
								isAgentType(event.target.value) &&
								setAgentType(event.target.value)
							}
							className="rounded-lg border border-zinc-300 bg-white p-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
						>
							{agents.map(({ id, label }) => (
								<option key={id} value={id}>
									{label}
								</option>
							))}
						</select>
					</label>

					{agents.map(({ id, label }) => (
						<div
							key={id}
							className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-black/15"
						>
							<div className="mb-1.5 flex items-center justify-between">
								<label
									htmlFor={`workbench-${id}-key`}
									className="text-xs font-bold text-zinc-750 dark:text-zinc-350"
								>
									{label} API Key
								</label>
								{keyExists[id] && (
									<button
										type="button"
										onClick={() => handleDeleteKey(id)}
										disabled={isLoading}
										className="text-[10px] font-bold text-red-500 hover:underline dark:text-red-400"
									>
										키체인에서 제거
									</button>
								)}
							</div>
							<input
								id={`workbench-${id}-key`}
								type="password"
								value={keys[id]}
								onChange={(event) =>
									setKeys((current) => ({
										...current,
										[id]: event.target.value,
									}))
								}
								placeholder={
									keyExists[id] ? "키체인에 저장됨" : `${label} API Key`
								}
								className="w-full rounded border border-zinc-300 bg-white p-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-850 dark:text-white"
							/>
						</div>
					))}

					<label className="flex flex-col gap-1.5 text-xs font-bold text-zinc-750 dark:text-zinc-350">
						Cursor CLI command
						<input
							value={cursorCliPath}
							onChange={(event) => setCursorCliPath(event.target.value)}
							className="rounded border border-zinc-300 bg-white p-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-850 dark:text-white"
						/>
					</label>
				</div>

				<footer className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
					<button
						type="button"
						onClick={onClose}
						disabled={isLoading}
						className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-750 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
					>
						취소
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={isLoading}
						className="rounded-lg bg-[var(--workbench-btn-primary)] px-4 py-2 text-sm font-semibold text-[var(--workbench-btn-primary-text)]"
					>
						{isLoading ? "저장 중…" : "설정 저장"}
					</button>
				</footer>
			</ModalSurface>
		</div>
	);
}
