"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createConfirmedUser, deleteUserByEmail, seedSampleParties } from "./actions";

// dev에서 빠른 참여를 위한 fixed UUID 파티들.
const JOIN_TARGETS: Array<{ id: string; label: string }> = [
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", label: "🧪 교촌치킨(완료된 시드, 3인)" },
  { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", label: "🍔 맘스터치(모집중, 2인)" },
  { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", label: "🍗 BBQ(모집중, 3인)" },
];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  function flash(msg: string) {
    setInfo(msg);
    setError(null);
  }
  function fail(msg: string) {
    setError(msg);
    setInfo(null);
  }

  // 가입 + 즉시 로그인 (이메일 인증 스킵)
  async function handleCreateAndSignIn() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (!email || !password) throw new Error("이메일과 비밀번호를 입력해주세요.");
      // 1) Server Action: admin API로 confirmed user 생성 + 프로필 row
      const created = await createConfirmedUser({
        email,
        password,
        nickname: nickname || null,
      });
      if (!created.ok) throw new Error(created.error);
      // 2) 클라이언트에서 signInWithPassword (세션 쿠키 설정)
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signErr) throw signErr;
      setUserId(created.userId);
      flash(
        created.reused
          ? `기존 계정의 비밀번호를 갱신하고 로그인했어요 (${created.userId.slice(0, 8)}…)`
          : `계정 생성 + 로그인 완료 (${created.userId.slice(0, 8)}…)`,
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : "계정 생성에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  // 이미 만든 계정으로 로그인만
  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signErr) {
        // Supabase는 미존재/오비번을 구분 안 함 → 가입 유도
        if (signErr.message.toLowerCase().includes("invalid login credentials")) {
          throw new Error(
            "이메일 또는 비밀번호가 틀렸어요. 처음이라면 아래 '관리자 계정 생성' 버튼을 눌러주세요.",
          );
        }
        throw signErr;
      }
      setUserId(data.user?.id ?? null);
      flash("로그인 완료");
    } catch (err) {
      fail(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(target: { id: string; label: string }) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (!userId) throw new Error("로그인이 필요해요.");
      // participants_insert_self RLS: auth.uid()=user_id AND is_host=false. status는 제한 없음 → 'approved'로 바로 INSERT.
      // 정원이 차면 on_participant_approved 트리거가 parties.status='closed'로 전이하고 chat_rooms를 생성한다.
      const { error: insErr } = await supabase
        .from("party_participants")
        .upsert(
          {
            party_id: target.id,
            user_id: userId,
            status: "approved",
            is_host: false,
          },
          { onConflict: "party_id,user_id" },
        );
      if (insErr) throw insErr;
      flash(`${target.label} 참여 완료. 정원 충족 시 채팅방이 자동 오픈됩니다.`);
    } catch (err) {
      fail(err instanceof Error ? err.message : "참여 등록 실패");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUserId(null);
    setInfo("로그아웃됨");
  }

  async function handleSeedParties() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await seedSampleParties();
      if (!res.ok) throw new Error(res.error);
      flash("샘플 파티 추가됨: " + res.inserted.join(", "));
    } catch (err) {
      fail(err instanceof Error ? err.message : "시드 실패");
    } finally {
      setBusy(false);
    }
  }

  // dev 전용: 입력된 이메일 사용자를 admin API로 삭제
  async function handleDelete() {
    if (!email) return fail("삭제할 이메일을 입력하세요.");
    if (!confirm(`정말 ${email} 계정을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await deleteUserByEmail(email);
      if (!res.ok) throw new Error(res.error);
      await supabase.auth.signOut();
      setUserId(null);
      flash(`${email} 삭제 완료`);
    } catch (err) {
      fail(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    // next는 URL 쿼리에서 온 임의 string이라 typedRoutes 타입 체크를 우회한다.
    router.push(next as never);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 입력 폼 */}
      <form onSubmit={handleSignIn} className="flex flex-col gap-3">
        <label className="block">
          <span className="text-xs text-foreground/70">이메일</span>
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
          />
        </label>

        <label className="block">
          <span className="text-xs text-foreground/70">비밀번호 (6자 이상)</span>
          <Input
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1"
          />
        </label>

        <label className="block">
          <span className="text-xs text-foreground/70">닉네임 (계정 생성 시)</span>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 린린"
            className="mt-1"
          />
        </label>

        {info && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{info}</p>
        )}
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-900">{error}</p>
        )}

        {/* dev 페이지라 "계정 생성 + 로그인"이 주 동작. 기존 계정 로그인은 보조. */}
        <Button
          type="button"
          size="lg"
          onClick={handleCreateAndSignIn}
          disabled={busy}
        >
          🛠 관리자 계정 생성 + 로그인 (이메일 인증 스킵)
        </Button>

        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? "처리 중…" : "이미 만든 계정으로 로그인"}
        </Button>
      </form>

      {/* 로그인 후 도구 */}
      {userId && (
        <div className="flex flex-col gap-2 rounded-lg border border-foreground/10 bg-background p-4">
          <p className="text-xs text-foreground/60">
            로그인됨 · <span className="font-mono">{userId.slice(0, 8)}…</span>
          </p>
          <Button onClick={goNext} disabled={busy}>
            {next === "/" ? "홈으로" : `이동: ${next}`}
          </Button>
          <div className="flex flex-col gap-1.5 rounded-md border border-foreground/10 p-3">
            <p className="text-[11px] font-medium text-foreground/70">파티 참여 (dev)</p>
            {JOIN_TARGETS.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleJoin(t)}
                disabled={busy}
                className="justify-start text-xs"
              >
                {t.label}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleSeedParties}
            disabled={busy}
          >
            🌱 모집중 파티 2개 추가 시드 (dev)
          </Button>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-1 text-[11px] text-foreground/50 hover:text-foreground/80"
          >
            로그아웃
          </button>
        </div>
      )}

      {/* 위험구역: dev 삭제 */}
      <details className="rounded-md border border-red-200 bg-red-50/40 p-3 text-xs">
        <summary className="cursor-pointer font-medium text-red-900">
          ⚠️ dev: 위 이메일의 계정 삭제
        </summary>
        <p className="mt-2 text-red-900/80">
          admin API로 입력된 이메일의 사용자를 영구 삭제합니다.
          관련 도메인 row(profiles 등)는 ON DELETE CASCADE로 함께 정리.
        </p>
        <Button
          type="button"
          variant="ghost"
          onClick={handleDelete}
          disabled={busy || !email}
          className="mt-2 w-full text-red-900 hover:bg-red-100"
        >
          {busy ? "처리 중…" : `${email || "(이메일 입력)"} 삭제`}
        </Button>
      </details>
    </div>
  );
}
