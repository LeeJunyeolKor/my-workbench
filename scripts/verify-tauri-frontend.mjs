import { existsSync } from "node:fs";
import { resolve } from "node:path";

const entryPath = resolve(".output/public/index.html");

if (!existsSync(entryPath)) {
	console.error(
		"Tauri 패키징을 중단합니다: .output/public/index.html이 없습니다. 서버 기능을 Tauri IPC로 옮긴 뒤 정적 앱 진입점을 생성해야 합니다.",
	);
	process.exitCode = 1;
}
