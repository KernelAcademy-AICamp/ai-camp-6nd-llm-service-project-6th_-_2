import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADDRESS_COOKIE, ADDRESS_COORDS_COOKIE, COOKIE_NAME } from "@/lib/auth";
import { createClient as createSsrClient } from "@/lib/supabase/server";

export async function POST() {
  // Supabase Auth 쿠키 제거
  try {
    const supabase = createSsrClient();
    await supabase.auth.signOut();
  } catch {
    // 세션이 이미 없거나 SSR cookies 쓰기 실패 시 무시
  }
  // soorimoo 커스텀 쿠키
  cookies().delete(COOKIE_NAME);
  // 데모용: 사용자 전환 시 주소 onboarding 다시 보이도록
  cookies().delete(ADDRESS_COOKIE);
  cookies().delete(ADDRESS_COORDS_COOKIE);
  return NextResponse.json({ ok: true });
}
