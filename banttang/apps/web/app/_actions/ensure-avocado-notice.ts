"use server";

// "아보카도 봇" 입장 안내 카드 — chat 페이지 SSR에서 호출, 방당 1건.
// 거래 유형(공동구매/배달 × 같은상품/각자담기) 안내를 카드 한 장에 함께 담는다(B안).
//
// 멱등성: 방당 avocado_notice 1건만(아래 JS 체크). + DB unique index가 백업.

import { createAdminClient } from "@/lib/supabase/admin";

type Category = "delivery" | "offline_shopping" | "online_shopping";

// 카테고리·나눔 방식별 한 줄 안내 (나눔 방식은 price_per_person===0=각자 담기로 판별)
function categoryLine(category: Category, individual: boolean): string {
  if (category === "delivery") {
    return individual
      ? "이번 거래는 각자 메뉴를 담아 함께 주문하는 배달이에요. 정산은 영수증 기준으로 진행돼요."
      : "이번 거래는 같은 음식을 함께 나누는 배달이에요. 정확한 정산을 위해 주문 후 영수증 인증이 필요해요.";
  }
  return individual
    ? "이번 거래는 각자 상품을 담아 함께 주문하는 공동구매예요. 본인이 담은 상품과 금액(배송비 분담)을 확인해 주세요."
    : "이번 거래는 같은 상품을 함께 나누는 공동구매예요. 1인당 받을 수량과 금액을 확인해 주세요.";
}

export async function ensureAvocadoNoticeMessage(
  partyId: string,
  notice: { version: number; title: string; body: string },
  opts?: { category?: Category; pricePerPerson?: number },
): Promise<{ ok: true; inserted: boolean } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", partyId)
      .maybeSingle();
    if (!room) return { ok: true, inserted: false };

    // 방당 1건만 — JSON 필터가 환경에 따라 불안정해 시스템 메시지를 가져와 JS에서 확인.
    const { data: sysMsgs } = await admin
      .from("chat_messages")
      .select("metadata")
      .eq("room_id", room.id)
      .eq("type", "system")
      .order("created_at", { ascending: true })
      .limit(80);
    const exists = ((sysMsgs ?? []) as { metadata: { kind?: string } | null }[]).some(
      (m) => m.metadata?.kind === "avocado_notice",
    );
    if (exists) return { ok: true, inserted: false };

    // 거래 유형 안내를 카드 본문에 함께 담는다(B안: 별도 메시지 없음).
    const guide =
      opts?.category != null
        ? `\n\n💡 ${categoryLine(opts.category, (opts.pricePerPerson ?? 1) === 0)}`
        : "";

    const { error } = await admin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: null,
      type: "system",
      content: notice.body + guide,
      metadata: {
        kind: "avocado_notice",
        bot: "avocado",
        version: notice.version,
        title: notice.title,
      },
    });
    if (error) {
      const isDup = error.code === "23505" || /duplicate key/i.test(error.message);
      if (isDup) return { ok: true, inserted: false };
      return { ok: false, error: error.message };
    }
    return { ok: true, inserted: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ensure 실패" };
  }
}
