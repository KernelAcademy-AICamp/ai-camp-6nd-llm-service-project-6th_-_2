import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getAnonClient } from "@/lib/supabase/anon";
import { getServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as {
      email?: string;
      password?: string;
    };
    if (!email || !password)
      return NextResponse.json(
        { error: "이메일과 비밀번호를 입력해주세요" },
        { status: 400 },
      );

    const anon = getAnonClient();
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data?.user)
      return NextResponse.json(
        { error: "이메일 또는 비밀번호가 올바르지 않아요" },
        { status: 401 },
      );

    const userId = data.user.id;

    // profile 존재 확인 (auth.users는 있지만 profile이 누락된 케이스 방어)
    const sb = getServiceClient();
    const { data: profile } = await sb
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile)
      return NextResponse.json(
        { error: "프로필이 없어요. 회원가입을 다시 해주세요." },
        { status: 404 },
      );

    cookies().set({
      name: COOKIE_NAME,
      value: userId,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
