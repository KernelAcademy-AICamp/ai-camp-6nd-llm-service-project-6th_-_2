// 사용자 행동 이벤트 통합 적재 — 추천 개인화 신호 + 성향 태깅 입력.
// best-effort: 실패해도 사용자 흐름을 막지 않는다(throw 안 함).
// 검색·클릭(서버 컴포넌트/액션)에 더해 찜·공구도 같은 로그로 통합 적재한다.
//   docs/user-propensity-tagging.md §2.1 (통합 적재 결정)

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveSignalFromTitle } from "@/lib/naver/personalize";

export type UserEventKind = "search" | "click" | "favorite" | "groupbuy";

// 카테고리 분포에 의미 있는 "콘텐츠" 섹션. AI추천("ai")·핫딜("hotdeal")은
// 피드 표면(surface) 이름일 뿐 품목 카테고리가 아니라 여기 포함하지 않는다.
const CONTENT_SECTIONS = new Set([
  "delivery",
  "market",
  "food",
  "health",
  "living",
  "beauty",
  "fashion",
]);

// 적재 직전 섹션 정규화: 콘텐츠 섹션이 아니면(없음/ai/hotdeal) keyword를 품목
// 키워드로 역매칭해 실제 섹션으로 접는다. 매칭 실패 시 원래 값을 유지(정직하게 null/표면).
function resolveSection(keyword: string, section?: string | null): string | null {
  if (section && CONTENT_SECTIONS.has(section)) return section;
  return deriveSignalFromTitle(keyword)?.section ?? section ?? null;
}

export async function logUserEvent(p: {
  userId: string;
  kind: UserEventKind;
  keyword: string;
  section?: string | null;
  price?: number | null;
}): Promise<void> {
  try {
    const keyword = (p.keyword ?? "").trim().slice(0, 100);
    if (!keyword) return;
    await createAdminClient()
      .from("user_events")
      .insert({
        user_id: p.userId,
        kind: p.kind,
        keyword,
        section: resolveSection(keyword, p.section),
        price: Number.isFinite(p.price as number) ? p.price : null,
      });
  } catch {
    // 로깅 실패는 무시 — 추천 품질에만 영향, 사용자 경험엔 영향 없음.
  }
}

// 카드 subtitle("12,000원 · 쿠팡")에서 가격(원)을 정수로 추출. 없으면 null.
// 쇼핑(shop) 카드만 "N원"으로 시작하고, 지역(local)은 주소라 매칭되지 않는다.
export function parsePriceFromSubtitle(subtitle?: string | null): number | null {
  if (!subtitle) return null;
  const m = subtitle.match(/([\d,]+)\s*원/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
