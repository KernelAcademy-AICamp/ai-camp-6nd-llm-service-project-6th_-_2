// 검색어 생성 (규칙 기반) — 추천 서비스 A단계
// 프로필(동네·연령·성별·관심사) → 네이버 검색어 목록.
//
// 다이어그램의 "검색어 생성 (프로필 → 검색어, 규칙 기반)" 박스에 대응.
// LLM 없이 결정적(deterministic) 규칙으로만 생성 → 테스트·캐시 키 안정.
//
// 설계 의도:
//   - profiles 테이블에 직접 묶지 않는 순수 함수. ProfileInput 객체만 받는다.
//   - 연령·관심사는 아직 DB 컬럼이 없으므로 optional. 없으면 기본 키워드로 폴백.
//     (온보딩이 연령·관심사를 수집하게 되면 그대로 채워 넣기만 하면 됨)
//   - 쇼핑(shop)은 전국 단위라 동네를 넣지 않는다. 동네는 local·blog·news 에만.

import type { LocalSort, ShopSort, DocSort } from "./client";

export type NaverSearchType = "local" | "shop" | "blog" | "news";

// 추천 피드 섹션 (다이어그램: 배달·장보기·생활템·동네소식)
export type FeedSection = "delivery" | "grocery" | "household" | "local_news";

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

// ---------- 기본 키워드 (관심사·연령 없을 때 폴백) ----------

const GROCERY_DEFAULTS = ["1인가구 밀키트", "자취 식재료", "소포장 반찬"];
const HOUSEHOLD_DEFAULTS = ["자취 생활용품", "1인가구 생필품"];

// 연령대별 생활템 플레이버 (가벼운 1개씩만 — 과한 규칙 금지)
const HOUSEHOLD_BY_AGE: Record<AgeBand, string> = {
  "20s": "자취방 인테리어 소품",
  "30s": "1인가구 주방용품",
  "40plus": "1인가구 건강식품",
};

// 관심사 태그 → 검색 종류별 확장 키워드.
// 알려진 태그는 매핑하고, 모르는 태그는 그대로 shop 쿼리로 통과시킨다(아래 로직).
const INTEREST_EXPANSION: Record<string, { shop?: string; delivery?: string }> = {
  자취요리: { shop: "자취 요리 밀키트", delivery: "백반" },
  홈카페: { shop: "홈카페 용품", delivery: "디저트 카페" },
  반려식물: { shop: "반려식물 화분" },
  운동: { shop: "홈트레이닝 용품", delivery: "샐러드" },
  맥주: { delivery: "치킨" },
  베이킹: { shop: "베이킹 재료" },
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

  // 1) 배달 맛집 (local) — 동네 기반
  queries.push(
    { section: "delivery", type: "local", query: `${nb} 맛집`, sort: "random" },
    { section: "delivery", type: "local", query: `${district} 배달 맛집`, sort: "comment" },
  );

  // 2) 장보기 (shop) — 전국. 관심사 우선, 없으면 기본 키워드
  for (const kw of GROCERY_DEFAULTS) {
    queries.push({ section: "grocery", type: "shop", query: kw, sort: "sim" });
  }

  // 3) 생활템 (shop) — 전국. 기본 + 연령 플레이버
  for (const kw of HOUSEHOLD_DEFAULTS) {
    queries.push({ section: "household", type: "shop", query: kw, sort: "sim" });
  }
  if (ageBand) {
    queries.push({
      section: "household",
      type: "shop",
      query: HOUSEHOLD_BY_AGE[ageBand],
      sort: "sim",
    });
  }

  // 4) 관심사 확장 — 알려진 태그는 매핑, 모르는 태그는 shop 쿼리로 통과
  for (const raw of interests) {
    const tag = raw.trim();
    if (!tag) continue;
    const exp = INTEREST_EXPANSION[tag];
    if (exp?.shop) {
      queries.push({ section: "grocery", type: "shop", query: exp.shop, sort: "sim" });
    }
    if (exp?.delivery) {
      queries.push({
        section: "delivery",
        type: "local",
        query: `${nb} ${exp.delivery}`,
        sort: "random",
      });
    }
    if (!exp) {
      // 미지 태그는 쇼핑 검색어로 그대로 사용
      queries.push({ section: "grocery", type: "shop", query: tag, sort: "sim" });
    }
  }

  // 5) 동네 소식 (blog + news) — 동네 기반
  queries.push(
    { section: "local_news", type: "blog", query: `${nb} 핫플`, sort: "sim" },
    { section: "local_news", type: "news", query: `${district} 소식`, sort: "date" },
  );

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
