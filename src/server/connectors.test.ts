import { describe, expect, it } from "vitest";
import { readConnectors } from "./connectors";

describe("readConnectors", () => {
	it("returns an empty list when no connectors are registered", async () => {
		await expect(readConnectors()).resolves.toEqual([]);
	});
});
