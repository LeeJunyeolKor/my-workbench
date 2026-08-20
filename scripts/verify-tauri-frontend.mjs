import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const outputDir = resolve("dist/client");
const entryPath = join(outputDir, "index.html");
const serverEntryPath = resolve("dist/server/server.js");

if (!existsSync(entryPath) || !existsSync(serverEntryPath)) {
	console.error(
		"Tauri 패키징을 중단합니다: 정적 앱 검증에 필요한 빌드 산출물이 없습니다.",
	);
	process.exitCode = 1;
	process.exit();
}

const javascriptFiles = walk(outputDir).filter((path) => path.endsWith(".js"));
const serverBundle = readFileSync(serverEntryPath, "utf8");
const hasEmptyServerFunctionManifest =
	/tanstack-start-server-fn-resolver[\s\S]*?\bvar manifest = \{\};\s*async function getServerFnById/.test(
		serverBundle,
	);
const browserExternalFiles = javascriptFiles.filter((path) => {
	const source = readFileSync(path, "utf8");
	return (
		basename(path).includes("__vite-browser-external") ||
		source.includes("__vite-browser-external")
	);
});

if (!hasEmptyServerFunctionManifest || browserExternalFiles.length) {
	if (!hasEmptyServerFunctionManifest) {
		console.error(
			"Tauri 정적 앱에서 사용할 수 없는 서버 함수 등록이 남았거나 등록 상태를 확인하지 못했습니다.",
		);
	}
	if (browserExternalFiles.length) {
		console.error(
			`Node 브라우저 대체 청크가 남았습니다: ${browserExternalFiles.join(", ")}`,
		);
	}
	process.exitCode = 1;
	process.exit();
}

console.log("Tauri용 정적 프런트엔드 검증을 통과했습니다.");

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : path;
	});
}
