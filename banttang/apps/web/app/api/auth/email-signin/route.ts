import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { createClient as createSsrClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/admin";

// signInWithPassword를 SSR 클라이언트로 호출 → Supabase Auth 쿠키(sb-*) 자동 설정.
// rin의 채팅 컴포넌트가 supabase.auth.getUser/getSession()으로 세션을 읽으려면 이게 필요.
// soorimoo의 기존 라우트는 banttang_user_id 커스텀 쿠키도 같이 본다(호환).
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

    const supabase = createSsrClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.user)
      return NextResponse.json(
        { error: "이메일 또는 비밀번호가 올바르지 않아요" },
        { status: 401 },
      );

    const userId = data.user.id;

    // profile 존재 확인
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

    // 기존 soorimoo 라우트와의 호환을 위한 커스텀 쿠키 (Supabase Auth 쿠키는 SSR 클라이언트가 자동 설정함)
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
