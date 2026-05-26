import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADDRESS_COOKIE, ADDRESS_COORDS_COOKIE } from "@/lib/auth";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { method, address, lat, lng } = (await req.json()) as {
    method: "current_location" | "manual";
    address?: string;
    lat?: number;
    lng?: number;
  };
  const resolved =
    method === "current_location"
      ? "관악구 신림동 (현재 위치 기준)"
      : address?.trim() || "신림동";

  cookies().set({
    name: ADDRESS_COOKIE,
    value: resolved,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  if (typeof lat === "number" && typeof lng === "number") {
    cookies().set({
      name: ADDRESS_COORDS_COOKIE,
      value: `${lat},${lng}`,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    // rin의 중간지점 추천(recommend-midpoint)이 auth.users.user_metadata.home를 읽으므로 같이 저장.
    try {
      const ssr = createSsrClient();
      const {
        data: { user },
      } = await ssr.auth.getUser();
      if (user) {
        const admin = getServiceClient();
        await admin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...(user.user_metadata ?? {}),
            home: { lat, lng, address: resolved },
          },
        });
      }
    } catch {
      // metadata 갱신 실패는 onboarding 흐름 자체를 막지 않음
    }
  }
  return NextResponse.json({ ok: true, address: resolved });
}

// 주소만 초기화 — 사용자는 그대로 두고 위치 onboarding만 다시 띄울 때 사용 (데모용)
export async function DELETE() {
  cookies().delete(ADDRESS_COOKIE);
  cookies().delete(ADDRESS_COORDS_COOKIE);
  return NextResponse.json({ ok: true });
}
