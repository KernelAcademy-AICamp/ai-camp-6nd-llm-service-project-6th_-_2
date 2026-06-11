"use server";

// 스토어 추천 피드 강제 갱신 — 1시간 캐시를 무시하고 네이버를 다시 호출해
// search_cache 를 즉시 갱신한다. (배달/쇼핑 링크 등 정제 로직 변경을 바로 반영)

import { revalidatePath } from "next/cache";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNeighborhoodFeed } from "@/lib/naver/cache";

export async function refreshStoreFeed(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const supabase = createServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return { ok: false, error: "로그인이 필요해요." };

    // 내 동네 조회
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("neighborhood_id, neighborhoods(id, name, district)")
      .eq("id", auth.user.id)
      .maybeSingle();

    const nbRaw = profile?.neighborhoods;
    const nb = (Array.isArray(nbRaw) ? nbRaw[0] : nbRaw) as
      | { id: string; name: string; district: string }
      | undefined;
    if (!nb) return { ok: false, error: "동네를 먼저 설정해 주세요." };

    // force: true → 캐시 무시하고 네이버 재호출 + search_cache upsert
    await getNeighborhoodFeed(
      { neighborhoodId: nb.id, name: nb.name, district: nb.district },
      { force: true },
    );

    revalidatePath("/store");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "갱신에 실패했어요.",
    };
  }
}
