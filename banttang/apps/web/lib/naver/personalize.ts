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
  meat: { section: "food", keywords: ["고기", "한우", "삼겹", "정육", "축산", "돼지", "소고기"] },
  vegetable: { section: "food", keywords: ["야채", "채소", "샐러드", "양파", "감자", "당근", "버섯"] },
  fruit: { section: "food", keywords: ["과일", "사과", "바나나", "딸기", "귤", "포도", "수박"] },
  kimchi: { section: "food", keywords: ["김치"] },
  coffee: { section: "food", keywords: ["커피", "원두", "라떼", "아메리카노"] },
  snack: { section: "food", keywords: ["과자", "스낵", "간식", "초콜릿", "젤리", "쿠키"] },
  staple: { section: "food", keywords: ["쌀", "라면", "햇반", "즉석밥", "국수", "냉면"] },
  seafood: { section: "food", keywords: ["해산물", "수산", "생선", "새우", "오징어", "조개", "연어", "광어", "고등어"] },
  dairy_egg: { section: "food", keywords: ["우유", "계란", "달걀", "치즈", "요거트", "버터"] },
  drink: { section: "food", keywords: ["생수", "음료", "주스", "탄산", "콜라", "맥주", "소주"] },
  pantry: { section: "food", keywords: ["통조림", "만두", "견과", "시리얼", "소스", "장류", "냉동"] },
  // 생필품 → living
  tissue: { section: "living", keywords: ["휴지", "티슈", "물티슈", "키친타월"] },
  detergent: { section: "living", keywords: ["세제", "세탁", "섬유유연제", "주방세제"] },
  diaper: { section: "living", keywords: ["기저귀"] },
  sanitary: { section: "living", keywords: ["생리대"] },
  household_etc: { section: "living", keywords: ["쓰레기봉투", "수세미", "지퍼백", "위생장갑", "호일", "건전지"] },
  // 뷰티·웰니스 → health / beauty
  supplement: { section: "health", keywords: ["영양제", "비타민", "유산균", "오메가", "홍삼", "루테인"] },
  protein: { section: "health", keywords: ["프로틴", "단백질"] },
  chickenbreast: { section: "health", keywords: ["닭가슴살"] },
  diet: { section: "health", keywords: ["다이어트", "곤약", "제로칼로리"] },
  mask: { section: "beauty", keywords: ["마스크팩", "마스크 팩"] },
  skincare: { section: "beauty", keywords: ["스킨", "로션", "선크림", "클렌징", "화장품", "샴푸", "에센스"] },
  // 패션 → fashion
  socks: { section: "fashion", keywords: ["양말"] },
  tshirt: { section: "fashion", keywords: ["티셔츠", "반팔"] },
  workout: { section: "fashion", keywords: ["운동복", "레깅스", "트레이닝"] },
  apparel_etc: { section: "fashion", keywords: ["속옷", "모자", "슬리퍼", "후드", "맨투맨", "바지"] },
  // 음식 배달 같이 시키기 → delivery
  delivery_food: { section: "delivery", keywords: ["치킨", "피자", "족발", "보쌈", "떡볶이", "마라탕", "배달", "야식", "햄버거"] },
};

// 온보딩 value → 한국어 칩 이름 (디버거 표기용). steps.ts 칩 라벨과 일치.
// 점수엔 영향 없음 — interest 신호 라벨을 섹션명("식품") 대신 품목명("고기")으로 구분.
const CATEGORY_LABEL: Record<string, string> = {
  bulk_grocery: "대용량 식재료",
  drinks_snacks: "음료·스낵",
  household: "생필품",
  wellness: "뷰티·웰니스",
  fashion: "패션",
  meat: "고기",
  vegetable: "야채",
  fruit: "과일",
  kimchi: "김치",
  coffee: "커피",
  snack: "과자",
  tissue: "휴지",
  detergent: "세제",
  diaper: "기저귀",
  sanitary: "생리대",
  supplement: "영양제",
  protein: "프로틴",
  chickenbreast: "닭가슴살",
  mask: "마스크팩",
  socks: "양말",
  tshirt: "티셔츠",
  workout: "운동복",
};

// 온보딩 value → 한국어 라벨. 'other:두부' 자유입력은 입력 텍스트 그대로.
export function categoryLabelFor(value: string): string | undefined {
  if (value.startsWith("other:")) {
    const text = value.slice("other:".length).trim();
    return text || undefined;
  }
  return CATEGORY_LABEL[value];
}

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

// ===========================================================================
// 5신호 개인화 랭킹 (점수 모델)
// ---------------------------------------------------------------------------
// 후보 카드는 외부(네이버) 데이터라 내부 카테고리가 없다 → 신호 매칭은 전부
// "카드 title ↔ CATEGORY_INFO 키워드/섹션" 텍스트 매칭으로 귀결한다.
//   score(card) = Σ_signal  ( keyword 일치 ? itemWeight : 섹션 일치 ? catWeight : 0 ) × decay
// 가중치는 docs/recommendation-personalization-ranking.md 의 점수표를 따른다.
// ===========================================================================

export const RANK_WEIGHTS = {
  interest: 2, // S1 명시 관심사 (카테고리 일치)
  favoriteCat: 3, // S3 찜 — 카테고리 일치
  favoriteItem: 5, // S3 찜 — 같은 품목 키워드
  groupBuyCat: 5, // S4 공구 — 카테고리 일치
  groupBuyItem: 8, // S4 공구 — 같은 품목 키워드
  searchPerHit: 0.5, // S5 검색·클릭 1회당
  searchCap: 3, // S5 같은 키워드 누적 상한
} as const;

// 신선도 감쇠 — exp(-λ·days), λ=ln10/90 → 0일 1.0 / 30일 0.46 / 90일 0.10.
// "30일 절반·90일 거의 0" 규칙. λ는 상수로 분리해 튜닝 가능.
const DECAY_LAMBDA = Math.LN10 / 90;

export function freshnessDecay(ageDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  return Math.exp(-DECAY_LAMBDA * ageDays);
}

export type SignalSource = "interest" | "gender" | "favorite" | "groupbuy" | "search" | "tag";

// 정규화된 개인화 신호 1건. getRankingSignals(서버)가 생성, scoreCard가 소비.
export type RankingSignal = {
  source: SignalSource;
  section: FeedSection; // 섹션(카테고리)만 일치할 때 매칭 대상
  keyword?: string; // 품목 키워드(있으면 카드 title 포함 검사)
  catWeight: number; // 섹션만 일치 시 점수
  itemWeight: number; // 품목 키워드 일치 시 점수 (≥ catWeight)
  ageDays: number; // 신선도 감쇠 입력 (행동 시점으로부터 경과일)
  decays?: boolean; // false면 감쇠 미적용(예: 온보딩 관심사·성별 — 고정 선호)
  // 운영 디버거 표시용(점수 계산엔 영향 없음): 매칭 라벨·행동 횟수.
  meta?: { count?: number; label?: string };
};

// 섹션 → 한국어 라벨 (디버거 점수 내역 표기용).
export const SECTION_LABEL: Record<FeedSection, string> = {
  delivery: "배달",
  market: "마켓",
  food: "식품",
  health: "건강",
  living: "리빙",
  beauty: "뷰티",
  fashion: "패션",
};

// 성별 → 약한 섹션 가점(+1). "강하게 적용하면 편견" → 가볍게, female만 명시.
// 연령은 profiles에 데이터가 없어 미적용(성별 신호로 통칭).
export const GENDER_AFFINITY: Record<string, FeedSection[]> = {
  female: ["beauty", "fashion"],
  male: [],
  prefer_not_to_say: [],
};
export const GENDER_WEIGHT = 1;

// 온보딩 value(steps.ts) → 섹션·키워드. 'other:두부' 자유입력도 처리.
export function categoryInfoFor(
  value: string,
): { section: FeedSection; keywords: string[] } | null {
  if (value.startsWith("other:")) {
    const text = value.slice("other:".length).trim();
    return text ? { section: "food", keywords: [text] } : null;
  }
  return CATEGORY_INFO[value] ?? null;
}

// 자유 텍스트(찜 title, 검색어)를 CATEGORY_INFO 키워드로 역매칭 → (섹션, 매칭 키워드).
// 어떤 품목 키워드와도 안 맞으면 null (그 신호는 점수에 기여하지 않음).
export function deriveSignalFromTitle(
  title: string,
): { section: FeedSection; keyword: string } | null {
  for (const info of Object.values(CATEGORY_INFO)) {
    for (const kw of info.keywords) {
      if (title.includes(kw)) return { section: info.section, keyword: kw };
    }
  }
  return null;
}

// 카드 1장의 개인화 점수 — 신호별 매칭 점수 합산.
export function scoreCard(
  card: { section: string; title: string },
  signals: RankingSignal[],
): number {
  let total = 0;
  for (const s of signals) {
    const decay = s.decays === false ? 1 : freshnessDecay(s.ageDays);
    if (s.keyword && card.title.includes(s.keyword)) {
      total += s.itemWeight * decay;
    } else if (card.section === s.section) {
      total += s.catWeight * decay;
    }
  }
  return total;
}

/**
 * 5신호 점수로 섹션 순서 + 섹션 내 카드 순서를 재정렬한다(입력 불변).
 *   - 섹션 순서: 섹션 내 카드 점수 합이 큰 섹션을 앞으로. primary_usage 강조 섹션은 최우선.
 *   - 카드 순서: 점수 내림차순, 동점이면 원래 순서(네이버 score) 보존.
 * 신호도 없고 primary_usage도 없으면 원본 그대로 반환(폴백).
 */
export function rankSections<S extends RankableSection>(
  sections: S[],
  signals: RankingSignal[],
  opts: { primaryUsage?: PrimaryUsage | null } = {},
): S[] {
  if (signals.length === 0 && !opts.primaryUsage) return sections;

  const topSection = opts.primaryUsage ? USAGE_TOP_SECTION[opts.primaryUsage] : null;
  const cardScore = (key: string, title: string) => scoreCard({ section: key, title }, signals);
  const sectionScore = (s: S) => s.cards.reduce((sum, c) => sum + cardScore(s.key, c.title), 0);

  // 섹션 정렬 — primary_usage 최우선 → 점수 합 → 원래 순서.
  const ordered = sections
    .map((s, i) => ({ s, i, sc: sectionScore(s) }))
    .sort((a, b) => {
      const ra = (topSection && a.s.key === topSection ? 1e6 : 0) + a.sc - a.i * 1e-3;
      const rb = (topSection && b.s.key === topSection ? 1e6 : 0) + b.sc - b.i * 1e-3;
      return rb - ra;
    })
    .map(({ s }) => s);

  // 섹션 내부 카드 — 점수 내림차순(안정 정렬: 동점은 원래 인덱스 유지).
  return ordered.map((s) => {
    if (s.cards.length === 0) return s;
    const boosted = s.cards
      .map((c, i) => ({ c, i, sc: cardScore(s.key, c.title) }))
      .sort((a, b) => b.sc - a.sc || a.i - b.i)
      .map(({ c }) => c);
    return { ...s, cards: boosted };
  });
}

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

// ---------------------------------------------------------------------------
// 점수 내역(설명) — 운영자 추천 디버거용. 카드 1장이 왜 그 점수인지 신호별로 분해.
// ---------------------------------------------------------------------------

export type ScoreLine = {
  source: SignalSource;
  label: string; // 예: "찜 이력 (닭가슴살 ×2)"
  base: number; // 감쇠 전 가중치
  decay: number; // 신선도 감쇠 계수 (1이면 미적용)
  net: number; // 실제 기여 = base × decay
  ageDays?: number; // 감쇠가 걸린 경우 "N일 전" 표기용
};

export type CardExplain = { total: number; lines: ScoreLine[] };

function labelForSignal(s: RankingSignal): string {
  const n = s.meta?.count ?? 1;
  const item = s.keyword ?? SECTION_LABEL[s.section];
  switch (s.source) {
    case "interest":
      // 칩 품목명(meta.label) → 자유입력(keyword) → 섹션명 순으로 표기.
      return `명시 관심사 (${s.meta?.label ?? s.keyword ?? SECTION_LABEL[s.section]})`;
    case "gender":
      return "성별 적합";
    case "favorite":
      return `찜 이력 (${item} ×${n})`;
    case "groupbuy":
      return `공구 참여 (${item} ×${n})`;
    case "search":
      return `검색 이력 (${item} ×${n})`;
    case "tag":
      // 성향 태그 가점 — meta.label 에 태그 라벨("식품 위주") 표기.
      return `성향 태그 (${s.meta?.label ?? SECTION_LABEL[s.section]})`;
  }
}

// 카드 1장의 점수를 신호별 라인으로 분해. scoreCard와 동일한 매칭 규칙을 쓴다.
export function explainCard(
  card: { section: string; title: string },
  signals: RankingSignal[],
): CardExplain {
  const lines: ScoreLine[] = [];
  for (const s of signals) {
    let base = 0;
    if (s.keyword && card.title.includes(s.keyword)) base = s.itemWeight;
    else if (card.section === s.section) base = s.catWeight;
    if (base === 0) continue;
    const decay = s.decays === false ? 1 : freshnessDecay(s.ageDays);
    lines.push({
      source: s.source,
      label: labelForSignal(s),
      base,
      decay,
      net: base * decay,
      ageDays: decay < 1 ? Math.round(s.ageDays) : undefined,
    });
  }
  const total = lines.reduce((sum, l) => sum + l.net, 0);
  return { total, lines };
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
