"use server";

// 게스트가 호스트에게 영수증 인증을 요청 — 채팅에 요청 시스템 메시지를 남긴다.
// (recipient='host'로 호스트 + 요청자 본인에게만 노출)

import { getAuthedUserId } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requestReceipt(
  partyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getAuthedUserId();
    if (!me) return { ok: false, error: "로그인이 필요해요." };
    const admin = createAdminClient();

    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", partyId)
      .maybeSingle();
    if (!room) return { ok: false, error: "채팅방이 아직 없어요." };

    const { data: profile } = await admin
      .from("profiles")
      .select("nickname")
      .eq("id", me)
      .maybeSingle();
    const nick = (profile as { nickname?: string } | null)?.nickname ?? "참여자";

    const { error } = await admin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: null,
      type: "system",
      content: `${nick}님이 영수증 인증을 요청했어요. 주문 후 영수증을 등록해 주세요.`,
      metadata: {
        kind: "receipt_request",
        sender_id: me,
        sender_nickname: nick,
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "요청 실패" };
  }
}
