"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// 정원이 차면 파티를 closed로 전이하고 채팅방·시스템 메시지를 만든다.
// 본래는 on_participant_approved 트리거가 처리해야 하지만, 트리거가 SECURITY DEFINER가 아니라
// 비-호스트 참여자가 INSERT할 때 RLS로 막혀 status/chat_rooms 변경이 무음 실패한다.
// 그 보정으로 admin 클라이언트로 동일 작업을 수행한다. 멱등 — 이미 처리됐으면 no-op.
export async function closePartyIfFull(
  partyId: string,
): Promise<{ ok: true; closed: boolean; roomId: string | null } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();

    // 1) 현재 파티 상태 확인
    const { data: party, error: pErr } = await admin
      .from("parties")
      .select("id, status, max_participants")
      .eq("id", partyId)
      .maybeSingle();
    if (pErr) return { ok: false, error: pErr.message };
    if (!party) return { ok: false, error: "party not found" };

    // 이미 종료된 상태면 no-op
    if (party.status !== "recruiting") {
      const { data: existingRoom } = await admin
        .from("chat_rooms")
        .select("id")
        .eq("party_id", partyId)
        .maybeSingle();
      return { ok: true, closed: false, roomId: existingRoom?.id ?? null };
    }

    // 2) 승인 인원 수
    const { count, error: cErr } = await admin
      .from("party_participants")
      .select("id", { count: "exact", head: true })
      .eq("party_id", partyId)
      .eq("status", "approved");
    if (cErr) return { ok: false, error: cErr.message };

    if ((count ?? 0) < party.max_participants) {
      return { ok: true, closed: false, roomId: null };
    }

    // 3) 마감 + 채팅방 + 시스템 메시지 (멱등)
    const { error: upErr } = await admin
      .from("parties")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", partyId)
      .eq("status", "recruiting"); // 동시성 보호: 다른 호출이 먼저 닫았으면 건너뜀
    if (upErr) return { ok: false, error: `parties update 실패: ${upErr.message}` };

    const { data: room, error: rErr } = await admin
      .from("chat_rooms")
      .upsert({ party_id: partyId }, { onConflict: "party_id" })
      .select("id")
      .single();
    if (rErr) return { ok: false, error: `chat_rooms upsert 실패: ${rErr.message}` };

    // 시스템 메시지는 한 번만 — 이미 있으면 SKIP
    const { count: sysCount } = await admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("type", "system");
    if ((sysCount ?? 0) === 0) {
      await admin.from("chat_messages").insert({
        room_id: room.id,
        sender_id: null,
        type: "system",
        system_event: "party_closed",
        content: "모집 완료! 거래방이 열렸어요",
      });
    }

    return { ok: true, closed: true, roomId: room.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
