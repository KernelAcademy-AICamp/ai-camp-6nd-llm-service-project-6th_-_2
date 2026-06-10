import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { FavoritesClient } from "@/components/FavoritesClient";
import type { StoreFavoriteRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// 찜한 가게·상품 목록. (app) 레이아웃이 로그인 보장 + UserBar가 뒤로가기 헤더 제공.
export default async function FavoritesPage() {
  const me = await requireCurrentUser();
  const sb = getServiceClient();
  const { data } = await sb
    .from("store_favorites")
    .select("id, kind, title, subtitle, link, image, created_at")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false });

  return <FavoritesClient items={(data ?? []) as StoreFavoriteRow[]} />;
}
