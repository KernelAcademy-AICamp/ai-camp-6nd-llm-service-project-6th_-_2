// 온보딩 선호도 → 스토어 추천 피드 개인화 (읽는 시점 재정렬).
//
// 정책(B안): 베이스 피드는 동네 단위 캐시(ALL_INTERESTS superset)를 그대로 쓰고,
// 네이버 재호출 없이 "표시단"에서만 개인화한다.
//   1) 섹션 순서: primary_usage(주 사용 유형) → 기본 강조 섹션을 맨 앞으로,
//      이어서 favorite_categories 가 가리키는 섹션을 매칭 수가 많은 순으로.
//   2) 카드 가중치: favorite_categories 의 품목 키워드가 카드 제목에 있으면 위로.
// 선호도가 비어 있으면 원래 순서를 그대로 반환(우아한 폴백).

import type { PrimaryUsage } from "@/lib/types/domain";
import type { FeedSection, SearchQuery } from "./query-builder";

// 온보딩 관심 품목 value(steps.ts) → (섹션, 제목 매칭 키워드).
// 키워드는 네이버 쇼핑/지역 결과 "제목"에 흔히 등장하는 한국어 표현.
const CATEGORY_INFO: Record<string, { section: FeedSection; keywords: string[] }> = {
  // 상위 카테고리 값(steps.ts chips) — 하위 미선택 시에도 섹션 순서에 반영(키워드 없음).
  bulk_grocery: { section: "food", keywords: [] },
  drinks_snacks: { section: "food", keywords: [] },
  household: { section: "living", keywords: [] },
  wellness: { section: "health", keywords: [] },
  fashion: { section: "fashion", keywords: [] },
  // 대용량 식재료 / 음료·스낵 → food
  meat: { section: "food", keywords: ["고기", "한우", "삼겹", "정육", "축산"] },
  vegetable: { section: "food", keywords: ["야채", "채소", "샐러드"] },
  fruit: { section: "food", keywords: ["과일"] },
  kimchi: { section: "food", keywords: ["김치"] },
  coffee: { section: "food", keywords: ["커피", "원두"] },
  snack: { section: "food", keywords: ["과자", "스낵", "간식"] },
  // 생필품 → living
  tissue: { section: "living", keywords: ["휴지", "티슈"] },
  detergent: { section: "living", keywords: ["세제", "세탁"] },
  diaper: { section: "living", keywords: ["기저귀"] },
  sanitary: { section: "living", keywords: ["생리대"] },
  // 뷰티·웰니스 → health / beauty
  supplement: { section: "health", keywords: ["영양제", "비타민"] },
  protein: { section: "health", keywords: ["프로틴", "단백질"] },
  chickenbreast: { section: "health", keywords: ["닭가슴살"] },
  mask: { section: "beauty", keywords: ["마스크팩", "마스크 팩"] },
  // 패션 → fashion
  socks: { section: "fashion", keywords: ["양말"] },
  tshirt: { section: "fashion", keywords: ["티셔츠", "반팔"] },
  workout: { section: "fashion", keywords: ["운동복", "레깅스", "트레이닝"] },
};

// primary_usage → 기본 강조 섹션. delivery_* 는 배달, shopping_* 는 장보기(=식품) 우선.
const USAGE_TOP_SECTION: Record<PrimaryUsage, FeedSection> = {
  delivery_bulk: "delivery",
  delivery_min: "delivery",
  shopping_bulk: "food",
  shopping_min: "food",
};

export type FeedPrefs = {
  primary_usage: PrimaryUsage | null;
  favorite_categories: string[];
};

/**
 * 온보딩 선호도(primary_usage + favorite_categories)로 만든 네이버 검색어 목록.
 * 추천 자체(B안)는 재정렬만 하지만, "내 맞춤 검색어"를 눈으로 보여줄 때 쓴다.
 * - primary_usage → 강조 섹션 검색어 1개 (배달=동네 맛집 / 장보기=식재료)
 * - favorite_categories → 품목 대표 키워드 검색어 (food/health/… 는 shop, delivery 는 local)
 */
export function buildPersonalizedQueries(
  prefs: FeedPrefs,
  neighborhood: { name: string; district: string },
): SearchQuery[] {
  const nb = neighborhood.name.trim();
  const out: SearchQuery[] = [];
  const seen = new Set<string>();

  const push = (section: FeedSection, type: "shop" | "local", query: string) => {
    const fullQuery = type === "local" ? `${nb} ${query}`.trim() : query;
    const key = `${type}::${fullQuery}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ section, type, query: fullQuery, sort: type === "local" ? "random" : "sim" });
  };

  // 주 사용 유형 강조
  if (prefs.primary_usage) {
    const top = USAGE_TOP_SECTION[prefs.primary_usage];
    if (top === "delivery") push("delivery", "local", "맛집");
    else push("food", "shop", "1인가구 장보기");
  }

  // 관심 품목 → 대표 키워드
  for (const value of prefs.favorite_categories ?? []) {
    // 자유 입력("other:두부") → 입력 텍스트 그대로 식품 shop 검색어로.
    if (value.startsWith("other:")) {
      const text = value.slice("other:".length).trim();
      if (text) push("food", "shop", text);
      continue;
    }
    const info = CATEGORY_INFO[value];
    if (!info || info.keywords.length === 0) continue; // 상위 카테고리(키워드 없음)는 스킵
    const type = info.section === "delivery" ? "local" : "shop";
    push(info.section, type, info.keywords[0]);
  }

  return out;
}

// 재정렬 대상 최소 구조 — StoreSection 등 어떤 형태든 동작하도록 제네릭.
type RankableSection = { key: string; cards: { title: string; score: number }[] };

/**
 * 선호도로 섹션 순서 + 섹션 내 카드 순서를 재정렬한다.
 * 입력 배열을 변형하지 않고 새 배열/새 카드 배열을 반환.
 */
export function personalizeSections<S extends RankableSection>(
  sections: S[],
  prefs: FeedPrefs,
): S[] {
  const hasPrefs =
    prefs.primary_usage != null || (prefs.favorite_categories?.length ?? 0) > 0;
  if (!hasPrefs) return sections;

  // 1) favorite_categories → 섹션별 매칭 수 + 키워드 모음
  const sectionMatchCount = new Map<string, number>();
  const keywordsBySection = new Map<string, string[]>();
  for (const value of prefs.favorite_categories ?? []) {
    const info = CATEGORY_INFO[value];
    if (!info) continue; // allowOther 자유입력 등 미매핑 값은 무시
    sectionMatchCount.set(info.section, (sectionMatchCount.get(info.section) ?? 0) + 1);
    const arr = keywordsBySection.get(info.section) ?? [];
    arr.push(...info.keywords);
    keywordsBySection.set(info.section, arr);
  }

  const topSection = prefs.primary_usage ? USAGE_TOP_SECTION[prefs.primary_usage] : null;

  // 2) 섹션 정렬 점수 — 클수록 앞으로. (primary_usage 최우선 → 매칭 수 → 원래 순서 유지)
  const rank = (key: string, originalIdx: number): number => {
    let r = 0;
    if (topSection && key === topSection) r += 1000;
    r += (sectionMatchCount.get(key) ?? 0) * 10;
    r -= originalIdx; // 동점이면 원래 순서 보존
    return r;
  };

  const ordered = sections
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(b.s.key, b.i) - rank(a.s.key, a.i))
    .map(({ s }) => s);

  // 3) 섹션 내부 카드 부스트 — 선호 키워드가 제목에 있으면 위로(안정 정렬).
  return ordered.map((s) => {
    const kws = keywordsBySection.get(s.key);
    if (!kws || kws.length === 0 || s.cards.length === 0) return s;
    const matches = (title: string) => kws.some((k) => title.includes(k));
    const boosted = s.cards
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const am = matches(a.c.title) ? 1 : 0;
        const bm = matches(b.c.title) ? 1 : 0;
        if (am !== bm) return bm - am; // 매칭 카드 먼저
        return a.i - b.i; // 동급이면 기존(score) 순서 유지
      })
      .map(({ c }) => c);
    return { ...s, cards: boosted };
  });
}
