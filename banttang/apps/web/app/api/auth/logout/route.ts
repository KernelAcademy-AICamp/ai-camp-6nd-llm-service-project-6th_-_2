import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
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
  // 주소 쿠키(banttang_address/_coords)는 지우지 않는다 — 위치는 profiles.neighborhood_id에
  // 영속되며, 실제 로그아웃이 저장된 위치를 리셋하면 재로그인 시 온보딩으로 튕긴다.
  // 위치를 다시 잡고 싶을 때는 "위치 재설정"(onboarding DELETE 엔드포인트)을 쓴다.
  return NextResponse.json({ ok: true });
}
