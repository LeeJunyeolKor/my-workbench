import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

const serverFn = vi.hoisted(() =>
	vi.fn().mockResolvedValue({ exists: false, projects: [] }),
);

vi.mock("@tanstack/react-start", () => ({
	useServerFn: () => serverFn,
}));

vi.mock("#/server/keychain", () => ({
	checkApiKeyInKeychainFn: vi.fn(),
	deleteApiKeyFromKeychainFn: vi.fn(),
	saveApiKeyToKeychainFn: vi.fn(),
}));

describe("SettingsModal", () => {
	it("labels the header close button for assistive technology", () => {
		render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

		expect(screen.getByRole("button", { name: "설정 닫기" })).toBeTruthy();
	});
});
