// 내부 배치 — 핫딜 RSS 수집 (pg_cron 이 호출).
//   POST /api/internal/refresh-hotdeals
//   헤더: Authorization: Bearer <CRON_SECRET>
//   → 공식 RSS 소스 수집 → hotdeals upsert(onConflict source_id,source_article_id).
//   docs/hotdeal-aggregator.md

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/admin";
import { crawlHotDeals, loadKnownSourceUrls } from "@/lib/hotdeal/crawl";

export const maxDuration = 120;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();

  // 이미 출처 URL을 가진 글은 상세 재fetch 생략 → 맵으로 전달.
  const known = await loadKnownSourceUrls(sb);

  const rows = await crawlHotDeals(known);
  if (rows.length === 0) {
    return NextResponse.json({ upserted: 0, note: "수집 결과 없음" });
  }

  const { error } = await sb
    .from("hotdeals")
    .upsert(rows, { onConflict: "source_id,source_article_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bySource: Record<string, number> = {};
  for (const r of rows) bySource[r.source_id] = (bySource[r.source_id] ?? 0) + 1;

  return NextResponse.json({ upserted: rows.length, bySource });
}
