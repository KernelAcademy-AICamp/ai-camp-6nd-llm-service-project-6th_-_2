import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { profileId } = (await req.json()) as { profileId?: string };
  if (!profileId) return NextResponse.json({ error: "profileId 필요" }, { status: 400 });

  const sb = getServiceClient();
  const { data, error } = await sb.from("profiles").select("id").eq("id", profileId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "프로필 없음" }, { status: 404 });

  cookies().set({
    name: COOKIE_NAME,
    value: data.id as string,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return NextResponse.json({ ok: true });
}
