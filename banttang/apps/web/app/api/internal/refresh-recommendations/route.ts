// 내부 배치 — AI 추천 생성 (pg_cron 이 호출).
//   POST /api/internal/refresh-recommendations
//   헤더: Authorization: Bearer <CRON_SECRET>
//   → 최근 활동한 사용자만: 후보 어셈블리 + Claude 재정렬·이유 → user_recommendations upsert.
//
// 비용 가드: 활성 사용자 한정, 동시성 제한, 동네 피드 캐시 공유로 네이버 호출 0.
//   docs/ai-recommendation-rag.md §3

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/admin";
import { assembleCandidates, type RecProfile } from "@/lib/recommend/candidates";
import { generateRecommendations } from "@/lib/recommend/generate";

export const maxDuration = 300;

const ACTIVE_WINDOW_DAYS = 7;
const CONCURRENCY = 5;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

type ProfileRow = {
  id: string;
  gender: string;
  favorite_categories: string[] | null;
  neighborhood_id: string | null;
  neighborhoods: { id: string; name: string; district: string } | null;
};

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();
  const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86400_000).toISOString();

  // 최근 활동한 사용자 id (중복 제거).
  const { data: evRows, error: evErr } = await sb
    .from("user_events")
    .select("user_id")
    .gte("created_at", since);
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 });

  const userIds = Array.from(new Set(((evRows ?? []) as { user_id: string }[]).map((r) => r.user_id)));
  if (userIds.length === 0) {
    return NextResponse.json({ generated: 0, total: 0, note: "활성 사용자 없음" });
  }

  // 프로필 일괄 조회.
  const { data: profileRows } = await sb
    .from("profiles")
    .select("id, gender, favorite_categories, neighborhood_id, neighborhoods(id, name, district)")
    .in("id", userIds);

  const profiles: RecProfile[] = ((profileRows ?? []) as unknown as ProfileRow[]).map((row) => {
    const nbRaw = row.neighborhoods as unknown;
    const nb = (Array.isArray(nbRaw) ? nbRaw[0] : nbRaw) as RecProfile["neighborhood"];
    return {
      id: row.id,
      favoriteCategories: row.favorite_categories ?? [],
      gender: row.gender ?? null,
      neighborhood: nb ?? null,
    };
  });

  // 한 명 처리: 후보 → 생성 → upsert. ok=저장성공, fallback=이유없이 폴백저장.
  const runOne = async (p: RecProfile): Promise<{ ok: boolean; fallback: boolean }> => {
    try {
      const candidates = await assembleCandidates(p);
      const { items, model, fallback } = await generateRecommendations(p, candidates);
      const { error } = await sb.from("user_recommendations").upsert(
        {
          user_id: p.id,
          neighborhood_id: p.neighborhood?.id ?? null,
          items,
          model,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      return { ok: !error, fallback };
    } catch {
      return { ok: false, fallback: true };
    }
  };

  // 동시성 제한 배치.
  let generated = 0;
  let fallbackCount = 0;
  for (let i = 0; i < profiles.length; i += CONCURRENCY) {
    const batch = profiles.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(runOne));
    for (const r of results) {
      if (r.ok) generated += 1;
      if (r.fallback) fallbackCount += 1;
    }
  }

  // 전량 폴백이면 이유가 안 채워진다 — 응답에 노출해 즉시 진단 가능하게.
  if (fallbackCount > 0) {
    console.warn(`[reco] fallback ${fallbackCount}/${profiles.length} — 이유 없이 저장됨(키/모델/후보 확인)`);
  }
  return NextResponse.json({ generated, fallbackCount, total: profiles.length });
}
