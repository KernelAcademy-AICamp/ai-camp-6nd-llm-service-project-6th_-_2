import { StoreSearchPageClient } from "@/components/StoreSearchPageClient";

// 스토어 검색 화면 — 최근 검색어 / 추천 검색어. (홈 feed/search 와 동일 패턴)
// localStorage 기반이라 server 단에선 셸만 렌더.
export const dynamic = "force-static";

export default function StoreSearchPage() {
  return <StoreSearchPageClient />;
}
