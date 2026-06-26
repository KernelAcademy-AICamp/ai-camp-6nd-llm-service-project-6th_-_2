"use server";

// 내 AI 추천 즉시 생성 — cron(매시) 기다리지 않고 사용자가 수동 갱신.
// 후보 어셈블리 + Claude 재정렬·이유 → user_recommendations upsert (본인 것만).
//   docs/ai-recommendation-rag.md §9

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assembleCandidates, type RecProfile } from "@/lib/recommend/candidates";
import { generateRecommendations } from "@/lib/recommend/generate";

type Result = { ok: true; count: number } | { ok: false; error: string };

export async function refreshMyRecommendations(): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!me.is_admin) return { ok: false, error: "권한이 없어요." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("profiles")
    .select("id, gender, favorite_categories, neighborhood_id, neighborhoods(id, name, district)")
    .eq("id", me.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "프로필을 찾을 수 없어요." };

  const r = row as Record<string, unknown>;
  const nbRaw = r.neighborhoods as unknown;
  const profile: RecProfile = {
    id: me.id,
    favoriteCategories: (r.favorite_categories as string[] | null) ?? [],
    gender: (r.gender as string | null) ?? null,
    neighborhood: (Array.isArray(nbRaw) ? nbRaw[0] : nbRaw) as RecProfile["neighborhood"],
  };

  try {
    const candidates = await assembleCandidates(profile);
    const { items, model } = await generateRecommendations(profile, candidates);
    const { error } = await admin.from("user_recommendations").upsert(
      {
        user_id: me.id,
        neighborhood_id: profile.neighborhood?.id ?? null,
        items,
        model,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/store");
    return { ok: true, count: items.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "생성 실패" };
  }
}
