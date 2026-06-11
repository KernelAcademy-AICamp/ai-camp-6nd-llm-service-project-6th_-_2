"use server";

// 플랫폼 공동구매 참여/취소 서버 액션.
// 인증은 cookie 기반 getCurrentUser, 쓰기는 admin 클라이언트(다른 도메인과 동일 패턴).
// 상품 정보/마감은 코드 config(getGroupBuy)에서 검증한다.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGroupBuy } from "@/lib/groupbuy";

type Result =
  | { ok: true }
  | { ok: false; error: string };

export async function joinGroupBuy(input: {
  slug: string;
  optionLabel: string;
  quantity: number;
}): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };

  const gb = getGroupBuy(input.slug);
  if (!gb) return { ok: false, error: "존재하지 않는 공구예요." };
  if (new Date(gb.deadlineAt).getTime() < Date.now())
    return { ok: false, error: "신청이 마감된 공구예요." };

  const option = gb.options.find((o) => o.label === input.optionLabel);
  if (!option) return { ok: false, error: "옵션을 선택해주세요." };

  const quantity = Math.min(Math.max(Math.trunc(input.quantity) || 1, 1), 99);

  const admin = createAdminClient();
  // (slug, user_id) 유일 → upsert 로 신청/수정 겸용
  const { error } = await admin
    .from("group_buy_participants")
    .upsert(
      {
        slug: gb.slug,
        user_id: me.id,
        option_label: option.label,
        quantity,
      },
      { onConflict: "slug,user_id" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/groupbuy/${gb.slug}`);
  return { ok: true };
}

// 입금 완료 알림 — 챗봇의 "입금 완료했어요" 버튼에서 호출.
export async function markGroupBuyPaid(slug: string): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("group_buy_participants")
    .update({ marked_paid_at: new Date().toISOString() })
    .eq("slug", slug)
    .eq("user_id", me.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/groupbuy/${slug}/chat`);
  return { ok: true };
}

export async function leaveGroupBuy(slug: string): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("group_buy_participants")
    .delete()
    .eq("slug", slug)
    .eq("user_id", me.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/groupbuy/${slug}`);
  return { ok: true };
}
