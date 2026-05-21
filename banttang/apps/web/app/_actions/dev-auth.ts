"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// dev 계정 전환용 고정 비밀번호. 카카오 OAuth 도입 전까지만 사용.
// "use server" 파일은 const export 금지 — 클라이언트는 dev-config.ts에서 import.
const DEV_PASSWORD = "123456";

// 주어진 이메일 사용자의 비밀번호를 dev 고정값으로 맞추고 이메일 인증을 강제 confirm.
// 클라이언트는 이 액션이 끝난 뒤 같은 비번으로 signInWithPassword를 호출하면 됨.
export async function ensureKnownPassword(
  email: string,
): Promise<{ ok: true; userId: string; password: string } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) return { ok: false, error: listErr.message };
    const found = list.users.find((u) => u.email === email);
    if (!found) return { ok: false, error: `${email} 계정을 찾지 못했어요.` };
    const { error } = await admin.auth.admin.updateUserById(found.id, {
      password: DEV_PASSWORD,
      email_confirm: true,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, userId: found.id, password: DEV_PASSWORD };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}
