"use server";

// 운영자(슈퍼 계정) 전용 — 신고/분쟁 처리.
// 반드시 ensureAdmin()으로 게이팅. 상태 변경은 admin 클라이언트(RLS 우회)로.
//   pending → reviewing(검토 중) → resolved(처리 완료) | dismissed(반려)
//   처리 완료/반려 시 resolved_at·resolved_note 기록.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPartyChatForAdmin, type AdminMessage, type ReportStatus } from "@/lib/admin-queries";

type Result = { ok: true } | { ok: false; error: string };

async function ensureAdmin(): Promise<Result> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!me.is_admin) return { ok: false, error: "운영자만 사용할 수 있어요." };
  return { ok: true };
}

// 분쟁 화면에서 채팅 로그를 인라인으로 펼칠 때 호출(lazy). 운영자만.
export async function fetchReportChatLog(
  partyId: string,
): Promise<{ ok: true; messages: AdminMessage[] } | { ok: false; error: string }> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const messages = await getPartyChatForAdmin(partyId);
  return { ok: true, messages };
}

// 신고 처리(통합) — 검토 시작 / 기각 / 경고 / 계정 제재 / 완료.
//   review  : reviewing(처리중) 으로 전환, 처리 흔적 비움
//   dismiss : dismissed(기각)
//   resolve : resolved(완료)
//   warn    : 피신고자 warning_count++ 후 resolved, 메모에 [경고] 표기
//   suspend : 피신고자 정지(suspended_at) 후 resolved, 메모에 [제재] 표기
// warn/suspend 는 reporteeId 필수.
export type ReportAction = "review" | "dismiss" | "resolve" | "warn" | "suspend";

export async function adminResolveReport(
  reportId: string,
  action: ReportAction,
  opts?: { note?: string; reporteeId?: string | null },
): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const note = opts?.note?.trim() ? opts.note.trim().slice(0, 1000) : null;
  const reporteeId = opts?.reporteeId ?? null;

  // 1) 당사자(피신고자) 조치 — 경고/제재
  if (action === "warn") {
    if (!reporteeId) return { ok: false, error: "경고 대상을 찾을 수 없어요." };
    const me = await getCurrentUser();
    if (me && reporteeId === me.id) return { ok: false, error: "본인에게는 경고할 수 없어요." };
    const { data: cur } = await admin
      .from("profiles")
      .select("warning_count")
      .eq("id", reporteeId)
      .maybeSingle();
    const next = ((cur as { warning_count?: number } | null)?.warning_count ?? 0) + 1;
    const { error: we } = await admin.from("profiles").update({ warning_count: next }).eq("id", reporteeId);
    if (we) return { ok: false, error: we.message };
  } else if (action === "suspend") {
    if (!reporteeId) return { ok: false, error: "제재 대상을 찾을 수 없어요." };
    const me = await getCurrentUser();
    if (me && reporteeId === me.id) return { ok: false, error: "본인은 제재할 수 없어요." };
    const { error: se } = await admin
      .from("profiles")
      .update({ suspended_at: new Date().toISOString(), suspended_reason: note ?? "신고 처리에 따른 제재" })
      .eq("id", reporteeId);
    if (se) return { ok: false, error: se.message };
  }

  // 2) 신고 상태 갱신
  const status: ReportStatus =
    action === "review" ? "reviewing" : action === "dismiss" ? "dismissed" : "resolved";
  const closing = status === "resolved" || status === "dismissed";
  const prefix = action === "warn" ? "[경고] " : action === "suspend" ? "[제재] " : "";
  const resolvedNote = closing ? `${prefix}${note ?? ""}`.trim() || null : null;

  const { error } = await admin
    .from("reports")
    .update({
      status,
      resolved_at: closing ? new Date().toISOString() : null,
      resolved_note: resolvedNote,
    })
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/reports");
  if (reporteeId) {
    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${reporteeId}`);
  }
  return { ok: true };
}
