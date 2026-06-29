"use server";

// 띵동 — Server Action
// 거래 시각 근처에 채팅방의 다른 멤버에게 도착 신호를 보낸다.
// - 참여자 → 호스트에게만 (metadata.recipient = 'host')
// - 호스트 → 모든 멤버에게 (recipient 미지정)
// - 2인 거래는 자동으로 양방향이 됨 (recipient='host'여도 호스트 한 명만 봄)
// - 활성화 윈도우: deal_at - 15분 ~ deal_at + 60분
// - 쿨다운: 같은 사용자가 5초 내 재발사 불가

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/auth";

// [TEMP-DEV] 띵동 기능 테스트를 위해 윈도우를 30일로 확장. 운영 배포 전 원복:
//   const ACTIVATION_BEFORE_MS = 15 * 60 * 1000;
//   const ACTIVATION_AFTER_MS = 60 * 60 * 1000;
const ACTIVATION_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVATION_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 5 * 1000;

export async function ringDoorbell(
  partyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getAuthedUserId();
    if (!userId) return { ok: false, error: "로그인이 필요해요." };

    const admin = createAdminClient();

    // 1) 파티 본문 — deal_at + 상태 + 호스트 여부 확인
    const { data: party } = await admin
      .from("parties")
      .select("id, deal_at, host_id, status")
      .eq("id", partyId)
      .maybeSingle();
    if (!party) return { ok: false, error: "파티를 찾을 수 없어요." };

    // 2) 활성화 윈도우 체크
    const dealMs = new Date(party.deal_at).getTime();
    const nowMs = Date.now();
    if (nowMs < dealMs - ACTIVATION_BEFORE_MS) {
      return { ok: false, error: "아직 띵동할 시간이 아니에요." };
    }
    if (nowMs > dealMs + ACTIVATION_AFTER_MS) {
      return { ok: false, error: "띵동 가능한 시간이 지났어요." };
    }

    // 3) 멤버십 확인
    const { data: membership } = await admin
      .from("party_participants")
      .select("id, is_host, profile:profiles!party_participants_user_id_fkey(nickname)")
      .eq("party_id", partyId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (!membership) return { ok: false, error: "파티 멤버가 아니에요." };

    const isHost = !!membership.is_host;
    const nickname =
      (membership.profile as { nickname?: string } | null)?.nickname ?? "참여자";

    // 참여자가 보내는 띵동은 화면에 "호스트 OO에게" 라고 표시되므로 호스트 닉네임 미리 조회.
    // parties.host_id로 profiles를 직접 조회 (party_participants join은 일부 케이스에서 null 반환).
    let hostNickname: string | null = null;
    if (!isHost) {
      const { data: hostProfile } = await admin
        .from("profiles")
        .select("nickname")
        .eq("id", party.host_id)
        .maybeSingle();
      hostNickname = (hostProfile?.nickname as string | undefined) ?? "파티장";
    }

    // 4) 채팅방 존재 확인
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", partyId)
      .maybeSingle();
    if (!room) return { ok: false, error: "아직 채팅방이 열리지 않았어요." };

    // 5) 쿨다운 — 같은 사용자가 5초 내 재발사 못 함
    const cooldownSince = new Date(nowMs - COOLDOWN_MS).toISOString();
    const { data: recent } = await admin
      .from("chat_messages")
      .select("id, metadata, created_at")
      .eq("room_id", room.id)
      .eq("type", "system")
      .gte("created_at", cooldownSince)
      .order("created_at", { ascending: false })
      .limit(20);
    const lately = (recent ?? []).some((m: any) => {
      const meta = m.metadata as { kind?: string; sender_id?: string } | null;
      return meta?.kind === "doorbell_ring" && meta?.sender_id === userId;
    });
    if (lately) {
      return { ok: false, error: "잠시 후 다시 시도해주세요." };
    }

    // 6) 시스템 메시지 INSERT
    // 참여자가 보낸 띵동은 호스트(+발신자 본인)만 보이게. 호스트가 보낸 띵동은 전원 표시.
    // 화면 표시 문구는 클라이언트에서 viewer 입장에 따라 분기 — content는 fallback 용도.
    const content = isHost
      ? `파티장 ${nickname}님이 "띵동" 했어요!`
      : `${nickname}님이 "띵동" 했어요!`;
    const metadata: Record<string, unknown> = {
      kind: "doorbell_ring",
      sender_id: userId,
      sender_nickname: nickname,
      sender_role: isHost ? "host" : "participant",
      host_nickname: hostNickname,
    };
    if (!isHost) metadata.recipient = "host";

    const { error: insErr } = await admin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: null,
      type: "system",
      content,
      metadata,
    });
    if (insErr) return { ok: false, error: `메시지 저장 실패: ${insErr.message}` };

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "띵동 실패",
    };
  }
}
