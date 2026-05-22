import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADDRESS_COOKIE, ADDRESS_COORDS_COOKIE, COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  cookies().delete(COOKIE_NAME);
  // 데모용: 사용자 전환 시 주소 onboarding 다시 보이도록 주소 쿠키도 초기화
  cookies().delete(ADDRESS_COOKIE);
  cookies().delete(ADDRESS_COORDS_COOKIE);
  return NextResponse.json({ ok: true });
}
