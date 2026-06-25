// 내부 캐시 갱신 엔드포인트 (D단계 — pg_cron 이 호출)
//   POST /api/internal/refresh-feeds
//   헤더: Authorization: Bearer <CRON_SECRET>
//   → is_active 동네 전부 refreshNeighborhoodFeed (네이버 호출 + 캐시 upsert)
//
// pg_cron(매시) → pg_net.http_post 로 호출된다. 유저 인증이 아니라 공유 시크릿으로 보호.
// 동네별 refresh 는 각각 네이버 18콜 + 재시도라 부하가 크므로 순차 처리한다.

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/admin";
import { refreshNeighborhoodFeed } from "@/lib/naver/cache";
import { isNaverConfigured } from "@/lib/naver/client";

// 긴 갱신을 위해 (활성 동네 × 네이버 호출) 충분한 시간 확보
export const maxDuration = 300;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 미설정이면 거부 (열린 엔드포인트 방지)
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

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
  return NextResponse.json({ refreshed, total: results.length, results });
}
