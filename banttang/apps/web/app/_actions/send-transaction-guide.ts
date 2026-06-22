"use server";

// 아보카도 봇 "거래 방법 보기" — 클릭 시 거래 방법 안내를 채팅 최신 메시지로 보낸다.
// (봇 메시지: sender_id=null, metadata.kind='avocado_guide')

import { createAdminClient } from "@/lib/supabase/admin";

const TRANSACTION_GUIDE = [
  "거래는 이렇게 진행돼요 👇",
  "",
  "① 채팅으로 메뉴·만날 장소·시간을 정해요.",
  "② 함께 주문하고 안전 픽업 장소에서 받아요.",
  "③ 영수증으로 금액을 인증하고 정산(송금)해요.",
  "④ 나눔이 끝나면 서로 후기를 남겨요.",
  "",
  "금액과 약속 시간·장소는 거래 전에 꼭 다시 확인해 주세요!",
].join("\n");

export async function sendTransactionGuide(
  partyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", partyId)
      .maybeSingle();
    if (!room) return { ok: false, error: "채팅방을 찾지 못했어요." };

    const { error } = await admin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: null,
      type: "system",
      content: TRANSACTION_GUIDE,
      metadata: { kind: "avocado_guide", bot: "avocado" },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "전송 실패" };
  }
}
