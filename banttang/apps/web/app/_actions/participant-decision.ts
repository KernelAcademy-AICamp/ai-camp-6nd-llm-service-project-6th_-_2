"use server";

// 호스트가 신청자를 승인/거절 — server action.
// 클라이언트에서 직접 supabase.update를 하면, 트리거 내부의 chat_rooms INSERT 등이
// 호출자(=호스트)의 RLS 컨텍스트로 실행되어 실패할 수 있다(SECURITY DEFINER 미적용 케이스).
// 여기선 admin client(service_role)로 실행해 RLS를 우회 + 트리거도 service_role로 동작.

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/auth";

async function ensureHostOfParticipant(
  participantId: string,
): Promise<{ ok: true; partyId: string } | { ok: false; error: string }> {
  const userId = await getAuthedUserId();
  if (!userId) return { ok: false, error: "로그인이 필요해요." };

  const admin = createAdminClient();
  const { data: row, error: rowErr } = await admin
    .from("party_participants")
    .select("id, party_id, party:parties!party_participants_party_id_fkey(host_id)")
    .eq("id", participantId)
    .maybeSingle();
  if (rowErr || !row) {
    return { ok: false, error: "신청을 찾을 수 없어요." };
  }
  const hostId =
    (row.party as unknown as { host_id?: string } | null)?.host_id ?? null;
  if (hostId !== userId) {
    return { ok: false, error: "파티장만 처리할 수 있어요." };
  }
  return { ok: true, partyId: row.party_id as string };
}

export async function approveParticipant(
  participantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const check = await ensureHostOfParticipant(participantId);
    if (!check.ok) return check;

    const admin = createAdminClient();
    const { error } = await admin
      .from("party_participants")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", participantId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "승인 중 오류가 발생했어요.",
    };
  }
}

export async function rejectParticipant(
  participantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const check = await ensureHostOfParticipant(participantId);
    if (!check.ok) return check;

    const admin = createAdminClient();
    const { error } = await admin
      .from("party_participants")
      .update({ status: "rejected" })
      .eq("id", participantId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "거절 중 오류가 발생했어요.",
    };
  }
}
