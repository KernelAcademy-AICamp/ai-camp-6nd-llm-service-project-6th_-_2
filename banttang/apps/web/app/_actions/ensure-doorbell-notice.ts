"use server";

// 거래 1시간 전 — 아보카도 봇이 '띵동' 안내를 별도 메시지로 보낸다(방당 1회).
// 거래 시간이 1시간 이내로 다가왔을 때만 삽입. 그 전엔 아무것도 안 함.

import { createAdminClient } from "@/lib/supabase/admin";

const LEAD_MS = 60 * 60 * 1000; // 거래 1시간 전부터

export async function ensureDoorbellNoticeMessage(
  partyId: string,
  dealAt: string,
): Promise<{ ok: true; inserted: boolean } | { ok: false; error: string }> {
  try {
    const dealMs = new Date(dealAt).getTime();
    // 아직 거래 1시간 전이 안 됐으면 보내지 않음
    if (Date.now() < dealMs - LEAD_MS) return { ok: true, inserted: false };

    const admin = createAdminClient();
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", partyId)
      .maybeSingle();
    if (!room) return { ok: true, inserted: false };

    // 방당 1건 — 시스템 메시지를 가져와 JS에서 kind 확인(중복 방지).
    const { data: sysMsgs } = await admin
      .from("chat_messages")
      .select("metadata")
      .eq("room_id", room.id)
      .eq("type", "system")
      .order("created_at", { ascending: true })
      .limit(120);
    const exists = ((sysMsgs ?? []) as { metadata: { kind?: string } | null }[]).some(
      (m) => m.metadata?.kind === "avocado_doorbell",
    );
    if (exists) return { ok: true, inserted: false };

    const { error } = await admin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: null,
      type: "system",
      content:
        "거래 1시간 전이에요! 약속 장소에 도착하면 우측 하단 ‘띵동’ 버튼으로 도착을 알릴 수 있어요. (거래 15분 전부터 누를 수 있어요)",
      metadata: { kind: "avocado_doorbell", bot: "avocado" },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, inserted: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "doorbell 안내 실패" };
  }
}
