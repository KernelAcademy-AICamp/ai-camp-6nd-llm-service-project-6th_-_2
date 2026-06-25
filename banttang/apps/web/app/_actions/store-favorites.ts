"use server";

// 스토어 찜(가게/상품) 서버 액션.
// 인증은 cookie 기반 getCurrentUser, 쓰기는 admin 클라이언트(다른 도메인과 동일 패턴).
// (user_id, link) 유일키로 토글한다.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoreFavoriteInput } from "@/lib/types";

type Result<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

// 찜 토글 — 이미 있으면 해제, 없으면 추가. 결과로 최종 상태(favorited) 반환.
export async function toggleStoreFavorite(
  input: StoreFavoriteInput,
): Promise<Result<{ favorited: boolean }>> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!input.link) return { ok: false, error: "잘못된 항목이에요." };
  const kind = input.kind === "store" ? "store" : "product";

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("store_favorites")
    .select("id")
    .eq("user_id", me.id)
    .eq("link", input.link)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("store_favorites")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/mypage/favorites");
    return { ok: true, data: { favorited: false } };
  }

  const { error } = await admin.from("store_favorites").insert({
    user_id: me.id,
    kind,
    title: input.title.slice(0, 200),
    subtitle: (input.subtitle ?? "").slice(0, 300),
    link: input.link,
    image: input.image ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/mypage/favorites");
  return { ok: true, data: { favorited: true } };
}

// 현재 유저가 찜한 link 목록 — 스토어 카드 하트 초기 상태(채워짐) 채우기용.
export async function getFavoritedLinks(): Promise<string[]> {
  const me = await getCurrentUser();
  if (!me) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_favorites")
    .select("link")
    .eq("user_id", me.id);
  return ((data ?? []) as { link: string }[]).map((r) => r.link);
}

// 찜 목록에서 개별 삭제 (id 기준)
export async function removeStoreFavorite(id: string): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("store_favorites")
    .delete()
    .eq("id", id)
    .eq("user_id", me.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/mypage/favorites");
  return { ok: true };
}
