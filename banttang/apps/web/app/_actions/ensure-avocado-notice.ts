"use server";

// "방장봇 아보카도" 시스템 메시지 안전망.
// chat 페이지 SSR에서 호출. room+version당 최대 1건만 존재.
//
// 멱등성 보장:
//   - DB unique partial index `uq_chat_messages_avocado_notice` (room_id, version)
//   - INSERT 시 unique violation(P0001/23505)이 나면 조용히 무시 = "이미 있음"

import { createAdminClient } from "@/lib/supabase/admin";

export async function ensureAvocadoNoticeMessage(
  partyId: string,
  notice: { version: number; title: string; body: string },
): Promise<{ ok: true; inserted: boolean } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", partyId)
      .maybeSingle();
    if (!room) return { ok: true, inserted: false };

    const { error } = await admin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: null,
      type: "system",
      content: `🥑 방장봇 아보카도: ${notice.body}`,
      metadata: {
        kind: "avocado_notice",
        version: notice.version,
        title: notice.title,
      },
    });

    // unique violation = 이미 있음 → 정상 처리
    if (error) {
      const isDup = error.code === "23505" || /duplicate key/i.test(error.message);
      if (isDup) return { ok: true, inserted: false };
      return { ok: false, error: error.message };
    }
    return { ok: true, inserted: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "ensure 실패",
    };
  }
}
