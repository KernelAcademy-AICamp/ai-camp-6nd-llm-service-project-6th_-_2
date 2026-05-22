"use server";

// 호스트가 중간지점 추천 카드의 "그대로 둘게요"를 눌렀을 때 — 메시지 metadata에
// decided='dismissed'를 영구 저장해 다시 들어와도 버튼이 안 보이게 한다.

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function dismissMidpointRecommendation(
  messageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return { ok: false, error: "로그인이 필요해요." };

    const admin = createAdminClient();

    // 메시지 → 방 → 파티 → 호스트 검증
    const { data: msg, error: msgErr } = await admin
      .from("chat_messages")
      .select("id, room_id, metadata, type")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr || !msg) return { ok: false, error: "메시지를 찾을 수 없어요." };
    if (msg.type !== "system") return { ok: false, error: "시스템 메시지가 아니에요." };

    const { data: room } = await admin
      .from("chat_rooms")
      .select("party_id")
      .eq("id", msg.room_id)
      .maybeSingle();
    if (!room) return { ok: false, error: "채팅방을 찾을 수 없어요." };

    const { data: party } = await admin
      .from("parties")
      .select("host_id")
      .eq("id", room.party_id)
      .maybeSingle();
    if (!party) return { ok: false, error: "파티를 찾을 수 없어요." };
    if (party.host_id !== auth.user.id) {
      return { ok: false, error: "호스트만 처리할 수 있어요." };
    }

    const oldMeta = (msg.metadata as Record<string, unknown>) ?? {};
    const newMeta = { ...oldMeta, decided: "dismissed" };
    const { error } = await admin
      .from("chat_messages")
      .update({ metadata: newMeta })
      .eq("id", messageId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "처리 중 오류가 발생했어요.",
    };
  }
}
