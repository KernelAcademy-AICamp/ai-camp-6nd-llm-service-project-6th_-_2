"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";
type Gender = "female" | "male";

const GENDER_OPTIONS: { v: Gender; label: string }[] = [
  { v: "female", label: "여성" },
  { v: "male", label: "남성" },
];

export function EmailLoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordMismatch =
    mode === "signup" && passwordConfirm.length > 0 && passwordConfirm !== password;

  const isValid =
    mode === "signin"
      ? email.trim().length > 0 && password.length >= 6
      : email.trim().length > 0 &&
        password.length >= 6 &&
        passwordConfirm === password &&
        nickname.trim().length >= 2 &&
        nickname.trim().length <= 10 &&
        gender !== null;

  async function submit() {
    if (!isValid || busy) return;
    setBusy(true);
    setError(null);
    const path = mode === "signin" ? "/api/auth/email-signin" : "/api/auth/email-signup";
    const body =
      mode === "signin"
        ? { email: email.trim(), password }
        : { email: email.trim(), password, nickname: nickname.trim(), gender };
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(j.error ?? "실패");
      return;
    }
    // 신규 가입자는 챗봇 온보딩으로, 로그인은 피드로
    router.push(mode === "signup" ? "/onboarding/tour" : "/feed");
    router.refresh();
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {/* 모드 토글 */}
      <div className="flex border-b border-zinc-200">
        {[
          { v: "signin", label: "로그인" },
          { v: "signup", label: "회원가입" },
        ].map((m) => (
          <button
            key={m.v}
            type="button"
            onClick={() => {
              setMode(m.v as Mode);
              setError(null);
            }}
            className={cn(
              "flex-1 border-b-2 py-3 text-sm font-semibold transition",
              mode === m.v
                ? "border-brand text-zinc-900"
                : "border-transparent text-zinc-400",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <Field label="이메일">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="비밀번호">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>

        {mode === "signup" && (
          <>
            <Field label="비밀번호 확인">
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="비밀번호 다시 입력"
                autoComplete="new-password"
                className={cn(
                  "w-full rounded-xl border px-3 py-2 text-sm",
                  passwordMismatch ? "border-rose-300" : "border-zinc-200",
                )}
              />
              {passwordMismatch && (
                <p className="mt-1 text-[11px] text-rose-500">
                  비밀번호가 일치하지 않아요
                </p>
              )}
            </Field>
            <Field label="닉네임">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="2~10자, 한글/영문/숫자"
                maxLength={10}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="성별">
              <div className="flex gap-2">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.v}
                    type="button"
                    onClick={() => setGender(g.v)}
                    className={cn(
                      "flex-1 rounded-xl border py-2 text-xs",
                      gender === g.v
                        ? "border-brand bg-brand-50 text-brand"
                        : "border-zinc-200 text-zinc-500",
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={!isValid || busy}
        className="w-full rounded-xl bg-brand py-3 font-semibold text-white shadow-sm disabled:opacity-50"
      >
        {busy ? "처리 중…" : mode === "signin" ? "로그인" : "회원가입"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
