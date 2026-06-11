"use server";

// 프로필 수정 — 닉네임 변경. 스키마 제약(2~10자, 한글/영문/숫자/_, UNIQUE)과 동일하게 검증.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]+$/;

export async function updateNickname(
  raw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요해요." };

  const nickname = (raw ?? "").trim();
  if (nickname.length < 2 || nickname.length > 10) {
    return { ok: false, error: "닉네임은 2~10자로 입력해 주세요." };
  }
  if (!NICKNAME_RE.test(nickname)) {
    return { ok: false, error: "한글·영문·숫자·_ 만 쓸 수 있어요." };
  }
  if (nickname === me.nickname) return { ok: true }; // 변경 없음

  const admin = createAdminClient();
  // 중복 확인 (UNIQUE 제약 + 사전 체크로 친절한 메시지)
  const { data: dup } = await admin
    .from("profiles")
    .select("id")
    .eq("nickname", nickname)
    .neq("id", me.id)
    .maybeSingle();
  if (dup) return { ok: false, error: "이미 사용 중인 닉네임이에요." };

  const { error } = await admin
    .from("profiles")
    .update({ nickname })
    .eq("id", me.id);
  if (error) {
    return { ok: false, error: "닉네임 변경에 실패했어요. 다시 시도해 주세요." };
  }

  revalidatePath("/mypage");
  revalidatePath("/mypage/profile");
  return { ok: true };
}
