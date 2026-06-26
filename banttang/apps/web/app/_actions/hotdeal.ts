"use server";

// 핫딜 즉시 갱신 — cron(매시) 기다리지 않고 사용자가 RSS 재수집.
// 전역 작업(hotdeals 테이블 공유)이라 외부 RSS 과호출 방지 쓰로틀을 둔다.
//   docs/hotdeal-aggregator.md

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { crawlHotDeals, loadKnownSourceUrls } from "@/lib/hotdeal/crawl";

const THROTTLE_MS = 60_000; // 최근 1분 내 수집했으면 재크롤 생략

type Result = { ok: true; count: number } | { ok: false; error: string };

export async function refreshHotDeals(): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!me.is_admin) return { ok: false, error: "권한이 없어요." };

  const sb = getServiceClient();

  // 쓰로틀: 마지막 수집이 1분 내면 그대로 둠(RSS·상세 사이트 보호).
  try {
    const { data } = await sb
      .from("hotdeals")
      .select("crawled_at")
      .order("crawled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.crawled_at && Date.now() - Date.parse(data.crawled_at) < THROTTLE_MS) {
      revalidatePath("/store");
      return { ok: true, count: 0 };
    }
  } catch {
    // 조회 실패는 무시하고 크롤 진행
  }

  try {
    const known = await loadKnownSourceUrls(sb);
    const rows = await crawlHotDeals(known);
    if (rows.length) {
      const { error } = await sb
        .from("hotdeals")
        .upsert(rows, { onConflict: "source_id,source_article_id" });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/store");
    return { ok: true, count: rows.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "갱신 실패" };
  }
}
