import path from "node:path";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"#": path.resolve(import.meta.dirname, "./src"),
		},
	},
	plugins: [viteReact()],
	test: {
		environment: "jsdom",
		globals: true,
	},
});
