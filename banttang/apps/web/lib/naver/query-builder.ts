// 검색어 생성 (규칙 기반) — 추천 서비스 A단계
// 프로필(동네·연령·성별·관심사) → 네이버 검색어 목록.
//
// 카테고리(6): 배달/식품/건강/리빙/뷰티/패션.
//   - 배달(delivery): 지역검색(local). 동네 기반 맛집.
//   - 그 외 5개: 쇼핑검색(shop). 전국 단위라 동네를 넣지 않는다.
// LLM 없이 결정적(deterministic) 규칙으로만 생성 → 테스트·캐시 키 안정.
//
// 설계 의도:
//   - profiles 테이블에 직접 묶지 않는 순수 함수. ProfileInput 객체만 받는다.
//   - 연령·관심사는 아직 DB 컬럼이 없으므로 optional. 없으면 기본 키워드로 폴백.

import type { LocalSort, ShopSort, DocSort } from "./client";

export type NaverSearchType = "local" | "shop" | "blog" | "news";

// 추천 피드 카테고리 (스토어 카테고리 아이콘과 1:1)
export type FeedSection =
  | "delivery"
  | "market" // 동네 주변 마트/마켓 (지역검색 local)
  | "food"
  | "health"
  | "living"
  | "beauty"
  | "fashion";

// 연령대 — profiles 에 아직 없음. 온보딩에서 받으면 매핑.
export type AgeBand = "20s" | "30s" | "40plus";

export type ProfileInput = {
  // neighborhoods.name / .district (예: "신림동" / "관악구")
  neighborhood: { name: string; district: string };
  // 현재 검색어 규칙엔 미사용 — 필드는 받아두되 노이즈 방지 위해 안 씀
  gender?: "female" | "male" | "prefer_not_to_say";
  ageBand?: AgeBand;
  // 자유 태그 (예: ["자취요리", "홈카페", "반려식물"])
  interests?: string[];
};

export type SearchQuery = {
  section: FeedSection;
  type: NaverSearchType;
  query: string;
  sort: LocalSort | ShopSort | DocSort;
};

// ---------- 카테고리별 기본 쇼핑 키워드 (관심사·연령 없을 때 폴백) ----------

const SHOP_DEFAULTS: Record<Exclude<FeedSection, "delivery" | "market">, string[]> = {
  food: ["1인가구 밀키트", "자취 식재료", "소포장 반찬"],
  health: ["건강식품", "비타민 영양제", "홈트레이닝 용품"],
  living: ["자취 생활용품", "1인가구 주방용품", "자취방 수납"],
  beauty: ["스킨케어 세트", "데일리 화장품"],
  fashion: ["데일리룩", "패션 잡화"],
};

// 연령대별 리빙 플레이버 (가벼운 1개씩만 — 과한 규칙 금지)
const LIVING_BY_AGE: Record<AgeBand, string> = {
  "20s": "자취방 인테리어 소품",
  "30s": "1인가구 홈데코",
  "40plus": "건강 가전",
};

// 관심사 태그 → (카테고리, 검색어) 확장. 모르는 태그는 식품 shop 으로 통과.
const INTEREST_EXPANSION: Record<
  string,
  { section: FeedSection; type: "shop" | "local"; query: string }
> = {
  자취요리: { section: "food", type: "shop", query: "자취 요리 밀키트" },
  홈카페: { section: "food", type: "shop", query: "홈카페 용품" },
  반려식물: { section: "living", type: "shop", query: "반려식물 화분" },
  운동: { section: "health", type: "shop", query: "단백질 보충제" },
  맥주: { section: "delivery", type: "local", query: "치킨" },
  베이킹: { section: "food", type: "shop", query: "베이킹 재료" },
};

// 선택 가능한 전체 관심사 태그. 현재 추천은 "모든 관심사 선택"을 가정하므로
// 캐시 갱신 시 이 전체 목록을 ProfileInput.interests 로 넣는다.
export const ALL_INTERESTS = Object.keys(INTEREST_EXPANSION);

// ---------- 검색어 생성 ----------

/**
 * 프로필 → 네이버 검색어 목록(규칙 기반).
 * 동일 (type, query) 는 중복 제거해 반환.
 */
export function buildSearchQueries(profile: ProfileInput): SearchQuery[] {
  const { neighborhood, ageBand, interests = [] } = profile;
  const nb = neighborhood.name.trim();
  const district = neighborhood.district.trim();
  const queries: SearchQuery[] = [];

  // 1) 배달 (local) — 동네 기반
  queries.push(
    { section: "delivery", type: "local", query: `${nb} 맛집`, sort: "random" },
    { section: "delivery", type: "local", query: `${district} 배달 맛집`, sort: "comment" },
  );

  // 1-2) 주변 마켓 (local) — 동네 마트/마켓
  queries.push(
    { section: "market", type: "local", query: `${nb} 마트`, sort: "random" },
    { section: "market", type: "local", query: `${nb} 마켓`, sort: "random" },
    { section: "market", type: "local", query: `${district} 대형마트`, sort: "comment" },
  );

  // 2) 쇼핑 카테고리 5개 (shop) — 전국. 기본 키워드
  for (const section of Object.keys(SHOP_DEFAULTS) as Array<keyof typeof SHOP_DEFAULTS>) {
    for (const kw of SHOP_DEFAULTS[section]) {
      queries.push({ section, type: "shop", query: kw, sort: "sim" });
    }
  }

  // 3) 연령 플레이버 — 리빙에 1개 가산
  if (ageBand) {
    queries.push({ section: "living", type: "shop", query: LIVING_BY_AGE[ageBand], sort: "sim" });
  }

  // 4) 관심사 확장 — 알려진 태그는 매핑, 모르는 태그는 식품 shop 으로 통과
  for (const raw of interests) {
    const tag = raw.trim();
    if (!tag) continue;
    const exp = INTEREST_EXPANSION[tag];
    if (exp) {
      const query = exp.type === "local" ? `${nb} ${exp.query}` : exp.query;
      const sort: SearchQuery["sort"] = exp.type === "local" ? "random" : "sim";
      queries.push({ section: exp.section, type: exp.type, query, sort });
    } else {
      queries.push({ section: "food", type: "shop", query: tag, sort: "sim" });
    }
  }

  return dedupe(queries);
}

// (type, query) 조합으로 중복 제거 — 같은 네이버 호출을 두 번 하지 않도록.
function dedupe(queries: SearchQuery[]): SearchQuery[] {
  const seen = new Set<string>();
  const out: SearchQuery[] = [];
  for (const q of queries) {
    const key = `${q.type}::${q.query}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}
