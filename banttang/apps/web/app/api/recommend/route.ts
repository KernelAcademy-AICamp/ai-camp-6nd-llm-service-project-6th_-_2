// 추천 피드 API (C단계 — 백엔드)
// 로그인 유저의 동네로 추천 피드를 돌려준다.
//   GET /api/recommend
//   → 프로필의 neighborhood_id → 동네별 캐시(B) 조회/갱신 → 섹션별 FeedCard 반환
//
// 흐름: requireCurrentUser → profiles.neighborhood_id+동네 → getNeighborhoodFeed
// 캐시 신선하면 네이버 호출 0, 만료면 갱신 후 반환.

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { getNeighborhoodFeed } from "@/lib/naver/cache";
import { isNaverConfigured } from "@/lib/naver/client";
import type { FeedSection } from "@/lib/naver/query-builder";

const EMPTY_SECTIONS: Record<FeedSection, never[]> = {
  delivery: [],
  market: [],
  food: [],
  health: [],
  living: [],
  beauty: [],
  fashion: [],
};

export async function GET() {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();

    // 프로필의 동네 + 동네 메타(name/district) 조인
    const { data: profile } = await sb
      .from("profiles")
      .select("neighborhood_id, neighborhoods(id, name, district)")
      .eq("id", me.id)
      .maybeSingle();

    // PostgREST 임베드는 to-one 이면 객체, 혹시 배열로 와도 첫 원소 사용
    const nbRaw = profile?.neighborhoods;
    const nb = (Array.isArray(nbRaw) ? nbRaw[0] : nbRaw) as
      | { id: string; name: string; district: string }
      | undefined;

    if (!nb) {
      return NextResponse.json(
        { error: "동네가 설정되지 않았습니다", code: "NO_NEIGHBORHOOD" },
        { status: 400 },
      );
    }

    const neighborhood = { id: nb.id, name: nb.name, district: nb.district };

    // 네이버 키 미설정 폴백 — 빈 피드 (recommend-places 라우트와 같은 폴백 패턴)
    if (!isNaverConfigured()) {
      return NextResponse.json({
        neighborhood,
        source: "fallback",
        fetched_at: null,
        sections: EMPTY_SECTIONS,
        fallback: true,
      });
    }

    const result = await getNeighborhoodFeed({
      neighborhoodId: nb.id,
      name: nb.name,
      district: nb.district,
    });

    return NextResponse.json({
      neighborhood,
      source: result.source, // "cache" | "fresh"
      fetched_at: result.fetched_at,
      sections: result.feed.sections,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
