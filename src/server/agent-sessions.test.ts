import { describe, expect, it } from "vitest";
import { pickRecentSessionFiles } from "#/server/agent-sessions";

describe("pickRecentSessionFiles", () => {
	it("keeps recent transcripts before applying the file limit", () => {
		const files = [
			{ filePath: "/old.jsonl", mtimeMs: 1 },
			{ filePath: "/mw-app-next.jsonl", mtimeMs: 3 },
			{ filePath: "/middle.jsonl", mtimeMs: 2 },
		];

		expect(pickRecentSessionFiles(files, 2)).toEqual([
			"/mw-app-next.jsonl",
			"/middle.jsonl",
		]);
	});
});
