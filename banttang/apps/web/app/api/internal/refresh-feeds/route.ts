// 내부 캐시 갱신 엔드포인트 (D단계 — pg_cron 이 호출)
//   POST /api/internal/refresh-feeds
//   헤더: Authorization: Bearer <CRON_SECRET>
//   1) is_active 동네 전부 refreshNeighborhoodFeed → search_cache 워밍 (동네 피드)
//   2) 실제 사용자 선호도 조합별 getPersonalizedFeed 워밍 → 추천 탭(기본 탭) unstable_cache
//
// pg_cron(매시) → pg_net.http_post 로 호출된다. 유저 인증이 아니라 공유 시크릿으로 보호.
// 미리 워밍해 두면 사용자 요청은 (동네 피드·추천 탭 모두) 캐시 적중 → 네이버 호출 0.
// 동네별 refresh 는 각각 네이버 18콜 + 재시도라 부하가 크므로 순차 처리한다.

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/admin";
import { refreshNeighborhoodFeed, getPersonalizedFeed } from "@/lib/naver/cache";
import { isNaverConfigured } from "@/lib/naver/client";
import { buildPersonalizedQueries, type FeedPrefs } from "@/lib/naver/personalize";

// 긴 갱신을 위해 (활성 동네 + 선호도 조합 × 네이버 호출) 충분한 시간 확보
export const maxDuration = 300;

// 맞춤 피드 워밍은 (동네 × 선호도 조합) 수만큼이라 폭주 방지 상한.
// 실제 조합은 중복 제거 후 크게 줄지만(베타 동네 소수), 안전장치로 캡을 둔다.
const MAX_PERSONALIZED_COMBOS = 80;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 미설정이면 거부 (열린 엔드포인트 방지)
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

type ComboRow = {
  primary_usage: string | null;
  favorite_categories: string[] | null;
  neighborhood_id: string | null;
  neighborhoods: { id: string; name: string; district: string } | null;
};

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isNaverConfigured()) {
    return NextResponse.json({ error: "네이버 키 미설정" }, { status: 503 });
  }

  const sb = getServiceClient();
  const { data: neighborhoods, error } = await sb
    .from("neighborhoods")
    .select("id, name, district")
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── 1) 동네 피드 워밍 (search_cache) ──────────────────────────────────────
  const results: Array<{ id: string; ok: boolean; query_count?: number; error?: string }> = [];
  // 순차 처리 — 동네끼리 네이버 부하가 겹치지 않게.
  for (const nb of neighborhoods ?? []) {
    try {
      const r = await refreshNeighborhoodFeed({
        neighborhoodId: nb.id,
        name: nb.name,
        district: nb.district,
      });
      results.push({ id: nb.id, ok: true, query_count: r.feed.query_count });
    } catch (e) {
      results.push({ id: nb.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const refreshed = results.filter((r) => r.ok).length;

  // ── 2) 맞춤 피드 워밍 (추천 탭 unstable_cache) ────────────────────────────
  // 추천 탭은 (동네 + 선호도)별 unstable_cache 라 동네 피드 워밍만으로는 안 채워진다.
  // 실제 사용자 선호도 조합을 모아 미리 호출 → 첫 진입 사용자도 캐시 적중.
  // best-effort: 실패해도 동네 피드 워밍 결과는 그대로 반환.
  const personalized = await warmPersonalizedFeeds(sb);

  return NextResponse.json({ refreshed, total: results.length, results, personalized });
}

// 실제 사용자 선호도 조합별로 getPersonalizedFeed 를 호출해 unstable_cache 를 채운다.
// 캐시 키는 페이지와 동일한 buildPersonalizedQueries + getPersonalizedFeed 로 맞춘다.
async function warmPersonalizedFeeds(
  sb: ReturnType<typeof getServiceClient>,
): Promise<{ warmed: number; combos: number; skipped: number; capped: boolean }> {
  // 동네가 있는 프로필의 (선호도) 조회. 같은 조합은 캐시를 공유하므로 중복 제거.
  const { data: profileRows } = await sb
    .from("profiles")
    .select("primary_usage, favorite_categories, neighborhood_id, neighborhoods(id, name, district)")
    .not("neighborhood_id", "is", null);

  // key = 동네 + primary_usage + 정렬된 favorite_categories → 같은 조합 1번만 워밍.
  const combos = new Map<
    string,
    { neighborhoodId: string; name: string; district: string; prefs: FeedPrefs }
  >();
  for (const raw of (profileRows ?? []) as unknown as ComboRow[]) {
    const nbRaw = raw.neighborhoods as unknown;
    const nb = (Array.isArray(nbRaw) ? nbRaw[0] : nbRaw) as ComboRow["neighborhoods"];
    if (!nb) continue;
    const favorites = raw.favorite_categories ?? [];
    const prefs: FeedPrefs = {
      primary_usage: raw.primary_usage as FeedPrefs["primary_usage"],
      favorite_categories: favorites,
    };
    const key = `${nb.id}|${raw.primary_usage ?? ""}|${[...favorites].sort().join(",")}`;
    if (!combos.has(key)) {
      combos.set(key, { neighborhoodId: nb.id, name: nb.name, district: nb.district, prefs });
    }
  }

  let warmed = 0;
  let skipped = 0;
  let capped = false;
  let processed = 0;
  // 순차 처리 — 동네 피드와 마찬가지로 네이버 동시 부하를 낮게 유지.
  for (const combo of combos.values()) {
    if (processed >= MAX_PERSONALIZED_COMBOS) {
      capped = true;
      break;
    }
    processed += 1;
    const queries = buildPersonalizedQueries(combo.prefs, {
      name: combo.name,
      district: combo.district,
    });
    if (queries.length === 0) {
      skipped += 1; // 선호도 없음 → 검색어 0 (네이버 호출 없음)
      continue;
    }
    try {
      // getPersonalizedFeed 가 캐시 미스면 네이버 호출 후 unstable_cache 에 저장.
      await getPersonalizedFeed(combo.neighborhoodId, queries, combo.name);
      warmed += 1;
    } catch {
      // 개별 조합 실패는 무시 — 사용자 경로에서 캐시 미스로 다시 시도된다.
    }
  }

  return { warmed, combos: combos.size, skipped, capped };
}
