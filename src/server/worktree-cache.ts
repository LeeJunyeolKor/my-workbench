import type { WorktreeConfig, WorktreeInfo } from "#/lib/worktree";

/**
 * getWorktrees 응답 서버 캐시 레이어 (stale-while-revalidate)
 *
 * - 캐시가 신선(TTL 이내)하면 즉시 반환
 * - 캐시가 오래됐으면 즉시 반환하되 백그라운드에서 재스캔하여 캐시 갱신
 * - 캐시가 없으면 스캔을 기다려 반환 (동시 요청은 in-flight 프로미스로 dedupe)
 * - 백그라운드 타이머가 주기적으로 캐시를 선제 갱신하여 첫 화면 진입을 빠르게 유지
 * - 워크트리 생성/삭제/설정 변경 시 invalidateWorktreeCache()로 무효화
 */

export type WorktreesResult = {
	worktrees: WorktreeInfo[];
	config: WorktreeConfig;
};

/** 캐시 신선 기간: 이 시간 안의 재요청은 스캔 없이 캐시 반환 */
const CACHE_TTL_MS = 30_000;
/** 백그라운드 주기 갱신 간격 */
const BACKGROUND_REFRESH_INTERVAL_MS = 60_000;

let cache: { data: WorktreesResult; fetchedAt: number } | null = null;
let inflight: Promise<WorktreesResult> | null = null;
let generation = 0;
let backgroundTimer: ReturnType<typeof setInterval> | null = null;

async function compute(): Promise<WorktreesResult> {
	if (inflight) return inflight;

	const myGeneration = generation;
	inflight = (async () => {
		try {
			const { getWorktreesImpl } = await import("./worktree-impl");
			const data = await getWorktreesImpl();
			// 스캔 도중 invalidate(세대 증가)가 일어났다면 결과를 캐시에 쓰지 않음
			if (myGeneration === generation) {
				cache = { data, fetchedAt: Date.now() };
			}
			return data;
		} finally {
			inflight = null;
		}
	})();

	return inflight;
}

function ensureBackgroundRefresh() {
	if (backgroundTimer) return;
	backgroundTimer = setInterval(() => {
		compute().catch((err) => {
			console.error("[worktree-cache] background refresh failed:", err);
		});
	}, BACKGROUND_REFRESH_INTERVAL_MS);
	// 타이머가 프로세스 종료를 막지 않도록 함
	backgroundTimer.unref?.();
}

/** 워크트리 생성/삭제/설정 변경 직후 호출하여 캐시 무효화 */
export function invalidateWorktreeCache() {
	generation += 1;
	cache = null;
}

export async function getWorktreesCached(
	forceRefresh = false,
): Promise<WorktreesResult> {
	ensureBackgroundRefresh();

	if (forceRefresh) {
		invalidateWorktreeCache();
		return compute();
	}

	if (cache) {
		const isStale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;
		if (isStale) {
			// stale-while-revalidate: 오래된 캐시를 즉시 반환하고 백그라운드에서 갱신
			compute().catch((err) => {
				console.error("[worktree-cache] revalidation failed:", err);
			});
		}
		return cache.data;
	}

	return compute();
}
