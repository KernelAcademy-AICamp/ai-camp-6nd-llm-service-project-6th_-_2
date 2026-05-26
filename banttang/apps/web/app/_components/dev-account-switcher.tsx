"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureKnownPassword } from "@/app/_actions/dev-auth";
import { cn } from "@/lib/utils";

interface Account {
  email: string;
  label: string;
}

const ACCOUNTS: Account[] = [
  { email: "rinrinyy818@gmail.com", label: "rinrinyy818 (호스트)" },
  { email: "oloiol777@naver.com", label: "oloiol777 (멤버)" },
];

// dev 전용: 미리 정의한 계정 사이를 한 번 클릭으로 전환.
// 매번 admin API로 비밀번호를 고정값(DEV_PASSWORD)으로 맞추고 signInWithPassword.
// 카카오 OAuth 도입 후엔 이 컴포넌트를 제거.
export function DevAccountSwitcher() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  async function switchTo(email: string) {
    setBusyEmail(email);
    setError(null);
    try {
      // 1) admin이 비밀번호를 알려진 값으로 맞춤 + 이메일 인증 강제 confirm
      const res = await ensureKnownPassword(email);
      if (!res.ok) throw new Error(res.error);
      // 2) 기존 세션 정리
      await supabase.auth.signOut();
      // 3) 새 계정으로 로그인 (서버가 알려준 비번 사용)
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: res.password,
      });
      if (signErr) throw signErr;
      setCurrentEmail(email);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "전환 실패");
    } finally {
      setBusyEmail(null);
    }
  }

  async function signOut() {
    setBusyEmail("__signout__");
    try {
      await supabase.auth.signOut();
      setCurrentEmail(null);
      router.refresh();
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
      <span className="font-semibold text-amber-900">🔁 dev 계정 전환</span>
      <span className="text-[11px] text-amber-900/70">
        현재: <span className="font-mono">{currentEmail ?? "로그아웃"}</span>
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {ACCOUNTS.map((a) => {
          const active = a.email === currentEmail;
          const busy = busyEmail === a.email;
          return (
            <button
              key={a.email}
              type="button"
              onClick={() => switchTo(a.email)}
              disabled={busyEmail !== null || active}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                active
                  ? "bg-brand text-brand-foreground"
                  : "bg-white text-foreground/80 hover:bg-foreground/5",
                busyEmail !== null && !active && "opacity-50",
              )}
            >
              {busy ? "전환 중…" : a.label}
            </button>
          );
        })}
        {currentEmail && (
          <button
            type="button"
            onClick={signOut}
            disabled={busyEmail !== null}
            className="rounded-md px-2 py-1 text-[11px] text-amber-900/70 hover:text-amber-900"
          >
            로그아웃
          </button>
        )}
      </div>
      {error && (
        <p className="basis-full rounded-md bg-red-50 px-2 py-1 text-[10px] text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
