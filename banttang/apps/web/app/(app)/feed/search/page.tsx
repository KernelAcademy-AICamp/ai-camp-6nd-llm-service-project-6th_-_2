import { SearchPageClient } from "@/components/SearchPageClient";

// 검색 화면 — 최근 검색어 / 최근 본 목록 / 추천 검색어 노출.
// 데이터 대부분 localStorage 기반이라 server 단에선 셸만 렌더.
export const dynamic = "force-static";

export default function SearchPage() {
  return <SearchPageClient />;
}
