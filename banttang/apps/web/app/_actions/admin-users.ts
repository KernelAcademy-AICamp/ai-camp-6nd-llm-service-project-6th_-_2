"use server";

// 운영자 — 회원 관리 액션 (제재 · 운영자 지정 · 봇 표시).
// 반드시 requireAdmin 게이팅. 쓰기는 admin 클라이언트(RLS 우회).
//   docs/admin-user-management.md §9 Phase 2

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

async function ensureAdmin(): Promise<{ ok: true; meId: string } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };
  if (!me.is_admin) return { ok: false, error: "운영자만 사용할 수 있어요." };
  return { ok: true, meId: me.id };
}

function revalidate(userId: string) {
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${userId}`);
}

// 제재(정지) — suspended_at 설정. 사유 선택.
export async function adminSuspendUser(userId: string, reason?: string): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  if (userId === gate.meId) return { ok: false, error: "본인은 제재할 수 없어요." };

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: reason?.slice(0, 200) ?? null })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidate(userId);
  return { ok: true };
}

// 제재 해제 — suspended_at 초기화.
export async function adminUnsuspendUser(userId: string): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ suspended_at: null, suspended_reason: null })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidate(userId);
  return { ok: true };
}

// 봇 표시/해제.
export async function adminSetBot(userId: string, isBot: boolean): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ is_bot: isBot })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidate(userId);
  return { ok: true };
}

// 운영자 지정/해제 — 가드: 본인 강등 금지, 마지막 운영자 강등 금지.
export async function adminSetAdmin(userId: string, isAdmin: boolean): Promise<Result> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();

  if (!isAdmin) {
    if (userId === gate.meId) return { ok: false, error: "본인 운영자 권한은 해제할 수 없어요." };
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_admin", true);
    if ((count ?? 0) <= 1) return { ok: false, error: "마지막 운영자는 해제할 수 없어요." };
  }

  const { error } = await admin.from("profiles").update({ is_admin: isAdmin }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidate(userId);
  return { ok: true };
}
