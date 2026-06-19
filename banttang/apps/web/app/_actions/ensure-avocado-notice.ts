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

    // 방당 봇 카드는 1개만 — 버전과 무관하게 이미 있으면 스킵(중복 방지).
    const { count: existing } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("metadata->>kind", "avocado_notice");
    if ((existing ?? 0) > 0) return { ok: true, inserted: false };

    // 봇 카드지만 type은 system으로 둔다(별도 enum 마이그레이션 불필요).
    // 화면에서는 metadata.kind='avocado_notice'를 보고 봇 말풍선/카드로 렌더한다.
    const { error } = await admin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: null,
      type: "system",
      content: notice.body,
      metadata: {
        // 중복 방지 unique 인덱스(uq_chat_messages_avocado_notice)가
        // kind='avocado_notice'만 커버하므로 kind는 유지한다.
        kind: "avocado_notice",
        bot: "avocado",
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
