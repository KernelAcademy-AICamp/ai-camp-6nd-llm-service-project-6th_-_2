import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

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

    // 신림동 베타 동네 (있으면 매칭)
    const { data: nb } = await sb
      .from("neighborhoods")
      .select("id")
      .eq("name", "신림동")
      .maybeSingle();

    const { error: profErr } = await sb.from("profiles").insert({
      id: userId,
      nickname: nick,
      gender,
      neighborhood_id: nb?.id ?? null,
    });
    if (profErr) {
      // 롤백: auth.users 정리
      await sb.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

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
