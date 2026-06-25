"use server";

// 채팅방 회원 프로필의 "신고하기 / 차단" 서버 액션.
//   - submitChatReport : reports 테이블에 신고 적재 → 운영자(/admin/reports) 큐로.
//   - toggleBlockUser  : user_blocks 토글(차단/해제). 상대 메시지 숨김은 클라이언트.
//   - getBlockedUserIds: 내가 차단한 회원 id 목록(채팅 타임라인 필터용).
// 신원은 getCurrentUser()로, 쓰기는 admin 클라이언트(RLS 우회)지만 항상 본인 id로만 적재.

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

// 채팅에서 가능한 신고 사유. (라벨은 클라이언트가 보유)
const REASON_CODES = ["no_show", "late", "payment", "unfair", "abusive", "scam", "other"] as const;
export type ChatReportReason = (typeof REASON_CODES)[number];

// 회원 신고 — target_type='user'. 거래 맥락(가게명)은 reason_detail 앞에 붙여 운영자가 알아보게.
export async function submitChatReport(input: {
  targetUserId: string;
  reasonCode: ChatReportReason;
  detail?: string;
  partyName?: string;
  partyId?: string; // 신고 발생 거래 — 운영자 분쟁 화면에서 채팅 로그 점프용
}): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (input.targetUserId === me.id) return { ok: false, error: "자기 자신은 신고할 수 없어요." };
  const reason = (REASON_CODES as readonly string[]).includes(input.reasonCode) ? input.reasonCode : "other";

  const ctx = input.partyName ? `[거래: ${input.partyName}] ` : "";
  const detail = `${ctx}${input.detail?.trim() ?? ""}`.trim().slice(0, 500) || null;

  const admin = createAdminClient();

  // 도배 방지 — 같은 신고자→대상의 미처리(pending/reviewing) 신고가 이미 있으면 막는다.
  const { data: dup } = await admin
    .from("reports")
    .select("id")
    .eq("reporter_id", me.id)
    .eq("target_type", "user")
    .eq("target_id", input.targetUserId)
    .in("status", ["pending", "reviewing"])
    .maybeSingle();
  if (dup) return { ok: false, error: "이미 접수된 신고가 처리 중이에요." };

  const { error } = await admin.from("reports").insert({
    reporter_id: me.id,
    target_type: "user",
    target_id: input.targetUserId,
    party_id: input.partyId ?? null,
    reason_code: reason,
    reason_detail: detail,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 차단 토글. block=true 면 추가, false 면 해제. 멱등 처리.
export async function toggleBlockUser(targetUserId: string, block: boolean): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (targetUserId === me.id) return { ok: false, error: "자기 자신은 차단할 수 없어요." };

  const admin = createAdminClient();
  if (block) {
    const { error } = await admin
      .from("user_blocks")
      .upsert({ blocker_id: me.id, blocked_id: targetUserId }, { onConflict: "blocker_id,blocked_id" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin
      .from("user_blocks")
      .delete()
      .eq("blocker_id", me.id)
      .eq("blocked_id", targetUserId);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

// 내가 차단한 회원 id 목록.
export async function getBlockedUserIds(): Promise<string[]> {
  const me = await getCurrentUser();
  if (!me) return [];
  const admin = createAdminClient();
  const { data } = await admin.from("user_blocks").select("blocked_id").eq("blocker_id", me.id);
  return ((data ?? []) as { blocked_id: string }[]).map((r) => r.blocked_id);
}
