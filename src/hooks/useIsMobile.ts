import { useEffect, useState } from "react";

/** 태블릿/모바일로 간주하는 최대 뷰포트 너비 */
export const MOBILE_BREAKPOINT_QUERY = "(max-width: 768px)";

/**
 * 뷰포트가 모바일/태블릿(768px 이하) 수준인지 감지하는 훅.
 * SSR 환경에서는 항상 false로 시작하고, 하이드레이션 이후 matchMedia로 동기화하며
 * 리사이즈로 임계값을 넘나들 때마다 실시간 갱신됩니다.
 */
export function useIsMobile(): boolean {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;

		const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
		const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);

		setIsMobile(mql.matches);
		mql.addEventListener("change", handleChange);
		return () => mql.removeEventListener("change", handleChange);
	}, []);

	return isMobile;
}
