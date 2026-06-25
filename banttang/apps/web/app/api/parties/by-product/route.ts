import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

// 큐레이션 추천 상품에 대한 매칭용 — 같은 store_name으로 호스트가 직접 만든
// 모집중 파티(가장 먼저 생긴 것)를 1건 반환. AI 시드 방(is_ai_pick=true)은 제외.
export async function GET(req: Request) {
  try {
    await requireCurrentUser();
  } catch {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const store = new URL(req.url).searchParams.get("store")?.trim();
  if (!store) {
    return NextResponse.json({ ok: true, party: null });
  }

  const sb = getServiceClient();
  const { data } = await sb
    .from("parties")
    .select("id, store_name, status, max_participants, host_id")
    .eq("store_name", store)
    .eq("status", "recruiting")
    .eq("is_ai_pick", false)
    .order("created_at", { ascending: true })
    .limit(1);

  const party = (data ?? [])[0] ?? null;
  return NextResponse.json({ ok: true, party });
}
