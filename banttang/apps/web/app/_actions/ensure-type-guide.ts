"use server";

// 거래 유형 안내 — 거래방 오픈 후 카테고리·나눔 방식에 맞는 안내를 1회 노출.
//   - 배달 음식: 영수증 인증 필요 안내 포함
//   - 공동구매: 수량/금액(배송비) 확인 안내
// 방당 1건만(metadata.kind='type_guide'). 별도 enum 마이그레이션 불필요(type='system').
// 나눔 방식은 price_per_person===0(각자 담기) 여부로 판별(split_mode 컬럼 의존 X).

import { createAdminClient } from "@/lib/supabase/admin";

type Category = "delivery" | "offline_shopping" | "online_shopping";

function guideText(category: Category, individual: boolean): string {
  if (category === "delivery") {
    return individual
      ? "각자 원하는 메뉴를 담아 함께 주문하는 배달 거래예요. 메뉴·옵션을 확인하고, 정산은 영수증 기준으로 진행돼요."
      : "같은 음식을 함께 나누는 배달 거래예요. 정확한 정산을 위해 주문 후 영수증 인증이 필요해요.";
  }
  // 공동구매(offline/online shopping)
  return individual
    ? "각자 원하는 상품을 담아 함께 주문하는 공동구매예요. 본인이 담은 상품과 금액(배송비 분담)을 확인해 주세요."
    : "같은 상품을 함께 나누는 공동구매예요. 1인당 받을 수량과 금액을 확인해 주세요.";
}

export async function ensureTypeGuideMessage(
  partyId: string,
  category: Category,
  pricePerPerson: number,
): Promise<{ ok: true; inserted: boolean } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", partyId)
      .maybeSingle();
    if (!room) return { ok: true, inserted: false };

    // 방당 1건 — 이미 있으면 스킵
    const { count } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("metadata->>kind", "type_guide");
    if ((count ?? 0) > 0) return { ok: true, inserted: false };

    const individual = pricePerPerson === 0; // 각자 담기 proxy
    const { error } = await admin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: null,
      type: "system",
      content: guideText(category, individual),
      metadata: { kind: "type_guide" },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, inserted: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "type guide 실패" };
  }
}
