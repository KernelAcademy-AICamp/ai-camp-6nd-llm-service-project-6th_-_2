// 동네별 캐시 + 결과 정제 (추천 서비스 B단계)
// 다이어그램의 "동네별 캐시(Supabase, 1시간)" + "결과 정리·정렬(중복 제거·가중치 정렬)".
//
// 흐름:
//   getNeighborhoodFeed(동네)
//     → 캐시 신선(1시간)하면 그대로 반환 (네이버 호출 0)
//     → 만료/없으면 refresh: 검색어 생성(A) → 네이버 4종 호출 → 정제 → 캐시 upsert
//
// 가정: "모든 사용자가 모든 관심사를 선택" → ALL_INTERESTS 고정. 동네당 피드 1개.

import "server-only";
import { getServiceClient } from "@/lib/supabase/admin";
import {
  searchLocal,
  searchShop,
  searchBlog,
  searchNews,
  isNaverConfigured,
  naverShoppingSearchUrl,
  type LocalSort,
  type ShopSort,
  type DocSort,
} from "./client";
import {
  buildSearchQueries,
  ALL_INTERESTS,
  type FeedSection,
  type NaverSearchType,
  type SearchQuery,
} from "./query-builder";

const TTL_MS = 60 * 60 * 1000; // 1시간
const PER_QUERY = 5; // 검색어당 가져올 결과 수
const MAX_PER_SECTION = 8; // 섹션별 피드 상한
// 네이버는 동시 요청을 과하게 받으면 일부를 429로 끊는다. 갱신은 1시간에 1번뿐이라
// 속도보다 정확성이 중요 → 동시 호출 수를 낮게 유지(카테고리 6개로 쿼리가 20+).
const CONCURRENCY = 2;

// 정제 후 UI 가 그대로 쓰는 정규화 카드.
export type FeedCard = {
  section: FeedSection;
  type: NaverSearchType;
  title: string;
  subtitle: string; // 섹션별 요약 (가격/주소/날짜 등)
  link: string;
  image: string | null;
  score: number; // 가중치 점수 (내림차순 정렬)
};

export type NeighborhoodFeed = {
  sections: Record<FeedSection, FeedCard[]>;
  query_count: number; // 이번 갱신에 쓴 네이버 호출 수 (캐시 hit 이면 0)
};

export type NeighborhoodInput = {
  neighborhoodId: string;
  name: string; // neighborhoods.name (예: "신림동")
  district: string; // neighborhoods.district (예: "관악구")
};

export type FeedResult = {
  feed: NeighborhoodFeed;
  source: "cache" | "fresh";
  fetched_at: string;
};

const EMPTY_SECTIONS = (): Record<FeedSection, FeedCard[]> => ({
  delivery: [],
  food: [],
  health: [],
  living: [],
  beauty: [],
  fashion: [],
});

// ---------- 공개 API ----------

/**
 * 동네 추천 피드 조회. 캐시 신선하면 그대로, 아니면 네이버 호출 후 갱신.
 * @param force true 면 캐시 무시하고 강제 갱신 (cron·디버깅용)
 */
export async function getNeighborhoodFeed(
  nb: NeighborhoodInput,
  opts: { force?: boolean } = {},
): Promise<FeedResult> {
  const sb = getServiceClient();

  if (!opts.force) {
    const { data } = await sb
      .from("search_cache")
      .select("feed, fetched_at, expires_at")
      .eq("neighborhood_id", nb.neighborhoodId)
      .maybeSingle();

    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      // 캐시 hit — 네이버 호출 0
      return {
        feed: { ...(data.feed as NeighborhoodFeed), query_count: 0 },
        source: "cache",
        fetched_at: data.fetched_at,
      };
    }
  }

  return refreshNeighborhoodFeed(nb);
}

/**
 * 강제 갱신 — 검색어 생성 → 네이버 호출 → 정제 → 캐시 upsert.
 * cron(D단계)에서도 이 함수를 직접 호출한다.
 */
export async function refreshNeighborhoodFeed(
  nb: NeighborhoodInput,
): Promise<FeedResult> {
  if (!isNaverConfigured()) {
    throw new Error("네이버 검색 API 키 미설정 — 캐시 갱신 불가");
  }

  const queries = buildSearchQueries({
    neighborhood: { name: nb.name, district: nb.district },
    interests: ALL_INTERESTS, // 모든 관심사 선택 가정
  });

  const feed = await fetchAndRefine(queries, nb.name);

  const sb = getServiceClient();
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + TTL_MS);

  await sb.from("search_cache").upsert({
    neighborhood_id: nb.neighborhoodId,
    feed,
    query_count: feed.query_count,
    fetched_at: fetchedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  return { feed, source: "fresh", fetched_at: fetchedAt.toISOString() };
}

// ---------- 네이버 호출 + 정제 ----------

async function fetchAndRefine(
  queries: SearchQuery[],
  region: string,
): Promise<NeighborhoodFeed> {
  // 동시성 제한 호출. 일부 실패해도 전체가 죽지 않도록 개별 catch.
  const results = await mapWithConcurrency(queries, CONCURRENCY, (q) =>
    runQuery(q, region).catch(() => [] as ScoredCard[]),
  );

  // 섹션별로 모은 뒤 중복 제거 → 점수 내림차순 → 상한.
  const buckets: Record<FeedSection, ScoredCard[]> = {
    delivery: [],
    food: [],
    health: [],
    living: [],
    beauty: [],
    fashion: [],
  };
  for (const cards of results) {
    for (const c of cards) buckets[c.card.section].push(c);
  }

  const sections = EMPTY_SECTIONS();
  for (const key of Object.keys(buckets) as FeedSection[]) {
    sections[key] = dedupeAndSort(buckets[key]).slice(0, MAX_PER_SECTION);
  }

  return { sections, query_count: queries.length };
}

// 동시 실행 수를 limit 으로 묶어 순서대로 처리. 입력 순서대로 결과 반환.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return out;
}

type ScoredCard = { dedupeKey: string; card: FeedCard };

// 검색어 1건 → 네이버 호출 → 정규화 + 점수 부여.
async function runQuery(q: SearchQuery, region: string): Promise<ScoredCard[]> {
  switch (q.type) {
    case "local": {
      const items = await searchLocal(q.query, { display: PER_QUERY, sort: q.sort as LocalSort });
      return items.map((it, i) => ({
        dedupeKey: `local::${it.name}::${it.road_address || it.address}`,
        card: {
          section: q.section,
          type: "local",
          title: it.name,
          subtitle: it.road_address || it.address || it.category,
          // 가게 홈페이지가 없으면(흔함) 네이버 지도 검색으로 폴백 → 항상 클릭 가능
          link: it.link || naverMapUrl(it.name, region),
          image: null,
          score: relevance(i, items.length),
        },
      }));
    }
    case "shop": {
      const items = await searchShop(q.query, { display: PER_QUERY, sort: q.sort as ShopSort });
      return items.map((it, i) => ({
        dedupeKey: `shop::${it.product_id}`,
        card: {
          section: q.section,
          type: "shop",
          title: it.title,
          subtitle: `${it.low_price.toLocaleString("ko-KR")}원 · ${it.mall_name}`,
          // 상품 딥링크는 로그인 게이트로 튕기므로 통합검색으로 연결
          link: naverShoppingSearchUrl(it.title),
          image: it.image || null,
          score: relevance(i, items.length),
        },
      }));
    }
    case "blog": {
      const items = await searchBlog(q.query, { display: PER_QUERY, sort: q.sort as DocSort });
      return items.map((it, i) => ({
        dedupeKey: `blog::${it.link}`,
        card: {
          section: q.section,
          type: "blog",
          title: it.title,
          subtitle: it.description,
          link: it.link,
          image: null,
          score: relevance(i, items.length) + recencyBoost(parseYmd(it.post_date)),
        },
      }));
    }
    case "news": {
      const items = await searchNews(q.query, { display: PER_QUERY, sort: q.sort as DocSort });
      return items.map((it, i) => ({
        dedupeKey: `news::${it.original_link || it.link}`,
        card: {
          section: q.section,
          type: "news",
          title: it.title,
          subtitle: it.description,
          link: it.link,
          image: null,
          score: relevance(i, items.length) + recencyBoost(new Date(it.pub_date)),
        },
      }));
    }
  }
}

// ---------- 정제 헬퍼 ----------

// 가게 홈페이지가 없을 때 폴백 — 네이버 지도 검색 URL (상호명 + 내 지역).
function naverMapUrl(name: string, region: string): string {
  const query = [name, region].filter(Boolean).join(" ");
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

// 관련도: 네이버가 준 순서가 앞일수록 높음 (0~1).
function relevance(rank: number, total: number): number {
  if (total <= 0) return 0;
  return (total - rank) / total;
}

// 최신도 보너스: 최근 30일 이내면 최대 +0.3 가산 (블로그·뉴스용).
function recencyBoost(date: Date | null): number {
  if (!date || isNaN(date.getTime())) return 0;
  const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo < 0) return 0;
  return Math.max(0, (30 - daysAgo) / 30) * 0.3;
}

// "YYYYMMDD" → Date
function parseYmd(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null;
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
}

// dedupeKey 로 중복 제거(최고 점수 유지) 후 점수 내림차순 정렬.
function dedupeAndSort(scored: ScoredCard[]): FeedCard[] {
  const best = new Map<string, FeedCard>();
  for (const { dedupeKey, card } of scored) {
    const prev = best.get(dedupeKey);
    if (!prev || card.score > prev.score) best.set(dedupeKey, card);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
