import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { createClient as createSsrClient } from "@/lib/supabase/server";

const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]+$/;

export async function POST(req: Request) {
  try {
    const { email, password, nickname, gender } = (await req.json()) as {
      email?: string;
      password?: string;
      nickname?: string;
      gender?: "female" | "male" | "prefer_not_to_say";
    };

    if (!email || !password)
      return NextResponse.json({ error: "이메일과 비밀번호를 입력해주세요" }, { status: 400 });
    if (password.length < 6)
      return NextResponse.json({ error: "비밀번호는 6자 이상이어야 해요" }, { status: 400 });
    const nick = (nickname ?? "").trim();
    if (nick.length < 2 || nick.length > 10)
      return NextResponse.json({ error: "닉네임은 2~10자" }, { status: 400 });
    if (!NICKNAME_RE.test(nick))
      return NextResponse.json({ error: "닉네임은 한글/영문/숫자/_만" }, { status: 400 });
    if (!gender || !["female", "male", "prefer_not_to_say"].includes(gender))
      return NextResponse.json({ error: "성별 선택 필요" }, { status: 400 });

    const sb = getServiceClient();

    // 닉네임 중복 사전 체크 (auth 만들고 실패하면 orphan)
    const { data: dup } = await sb
      .from("profiles")
      .select("id")
      .eq("nickname", nick)
      .maybeSingle();
    if (dup) return NextResponse.json({ error: "이미 사용 중인 닉네임" }, { status: 409 });

    // auth.users 생성 (이메일 확인 건너뜀)
    const { data: created, error: authErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr || !created?.user)
      return NextResponse.json(
        { error: authErr?.message ?? "auth 생성 실패" },
        { status: 400 },
      );
    const userId = created.user.id;

    // neighborhood_id는 가입 시 비워둔다 — 온보딩(위치 설정)에서 실제 동네로 채운다.
    // 신림동을 기본으로 박으면 위치를 설정해도 신림동에 고정되는 문제가 생긴다.
    const { error: profErr } = await sb.from("profiles").insert({
      id: userId,
      nickname: nick,
      gender,
      neighborhood_id: null,
    });
    if (profErr) {
      // 롤백: auth.users 정리
      await sb.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    // Supabase 세션(sb-*)도 세운다 — email-signin과 동일.
    // 이게 없으면 auth.getUser()에 의존하는 서버 액션/라우트(승인·띵동·중간지점·영수증 등)가
    // 갓 가입한 유저에서 "비로그인"으로 실패한다. SSR 클라이언트가 쿠키를 자동 설정.
    const ssr = createSsrClient();
    const { error: signErr } = await ssr.auth.signInWithPassword({ email, password });
    if (signErr) {
      // 세션 세팅 실패해도 커스텀 쿠키로 기본 흐름은 가능하므로 가입 자체는 성공 처리하되 로그는 남긴다.
      console.error("[email-signup] 세션 생성 실패(signInWithPassword):", signErr);
    }

    // 커스텀 쿠키(banttang_user_id) — 기존 라우트 호환용. Supabase 세션과 함께 세팅.
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
