"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { createConfirmedUser, type Gender } from "./actions";

type Mode = "signin" | "signup";

// 로그인 / 회원가입 폼 — 토글 탭으로 두 모드 전환.
// 회원가입은 admin API로 email_confirm=true 처리(MVP 단계, 이메일 인증 스킵).
// 카카오 OAuth 도입 시 이 파일 교체.
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [supabase] = useState(() => createClient());
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setLoggedInEmail(data.user?.email ?? null);
    });
  }, [supabase]);

  // 입력 검증 — 폼별로 조금 다름
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const passwordValid = password.length >= 6;
  const nicknameValid =
    mode === "signin" ? true : /^[가-힣a-zA-Z0-9_]{2,10}$/.test(nickname);
  const genderValid = mode === "signin" ? true : gender !== null;
  const canSubmit =
    emailValid && passwordValid && nicknameValid && genderValid && !submitting;

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signErr) {
        if (signErr.message.toLowerCase().includes("invalid login credentials")) {
          throw new Error(
            "이메일 또는 비밀번호가 일치하지 않아요. 처음이라면 회원가입을 해주세요.",
          );
        }
        throw signErr;
      }
      router.push(next as never);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createConfirmedUser({
        email,
        password,
        nickname,
        gender: gender ?? undefined,
      });
      if (!created.ok) throw new Error(created.error);
      // 가입 직후 자동 로그인
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signErr) throw signErr;
      router.push(next as never);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setLoggedInEmail(null);
    setError(null);
    router.refresh();
  }

  // 이미 로그인된 상태면 안내 화면
  if (loggedInEmail) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-10">
        <header className="mt-6 text-center">
          <h1 className="text-3xl font-bold text-brand">반띵</h1>
        </header>
        <div className="mt-12 flex flex-col items-center gap-2 rounded-2xl bg-gray-50 p-6 text-center ring-1 ring-black/[0.04]">
          <p className="text-[14px] font-bold text-gray-900">
            이미 로그인되어 있어요
          </p>
          <p className="text-[12px] text-gray-500">{loggedInEmail}</p>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <a
            href={next}
            className="flex h-12 items-center justify-center rounded-xl bg-brand text-[15px] font-bold text-white transition-opacity active:opacity-80"
          >
            반띵으로 가기
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            className="h-12 rounded-xl bg-gray-100 text-[14px] font-semibold text-gray-700 transition-colors active:bg-gray-200"
          >
            로그아웃
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-8">
      <header className="mt-4 text-center">
        <h1 className="text-3xl font-bold text-brand">반띵</h1>
        <p className="mt-1.5 text-[13px] text-gray-500">
          같은 동네 1인 가구끼리 장보기·배달을 같이.
        </p>
      </header>

      <div className="mt-8 flex rounded-2xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
          }}
          className={cn(
            "flex-1 rounded-xl py-2.5 text-[14px] font-bold transition-colors",
            mode === "signin" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
          )}
        >
          로그인
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError(null);
          }}
          className={cn(
            "flex-1 rounded-xl py-2.5 text-[14px] font-bold transition-colors",
            mode === "signup" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
          )}
        >
          회원가입
        </button>
      </div>

      <form
        onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
        className="mt-6 flex flex-col gap-3"
      >
        <Field
          label="이메일"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <Field
          label="비밀번호"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="6자 이상"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />
        {mode === "signup" && (
          <>
            <Field
              label="닉네임"
              type="text"
              value={nickname}
              onChange={setNickname}
              placeholder="2~10자, 한글/영문/숫자"
              autoComplete="username"
              maxLength={10}
            />
            <GenderSelect value={gender} onChange={setGender} />
          </>
        )}

        {error && (
          <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "mt-2 h-12 rounded-xl text-[15px] font-bold transition-opacity",
            canSubmit
              ? "bg-brand text-white active:opacity-80"
              : "bg-gray-200 text-gray-400",
          )}
        >
          {submitting
            ? mode === "signin"
              ? "로그인 중…"
              : "가입 중…"
            : mode === "signin"
              ? "로그인"
              : "회원가입"}
        </button>

      </form>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-bold text-gray-700">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className="h-12 w-full rounded-xl bg-gray-50 px-4 text-[14px] text-gray-900 ring-1 ring-black/[0.06] outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand/40"
      />
    </label>
  );
}

const GENDERS: { key: Gender; label: string }[] = [
  { key: "female", label: "여성" },
  { key: "male", label: "남성" },
];

function GenderSelect({
  value,
  onChange,
}: {
  value: Gender | null;
  onChange: (g: Gender) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold text-gray-700">성별</p>
      <div className="grid grid-cols-2 gap-2">
        {GENDERS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => onChange(g.key)}
            aria-pressed={value === g.key}
            className={cn(
              "h-12 rounded-xl text-[14px] font-bold transition-colors",
              value === g.key
                ? "bg-brand text-white"
                : "bg-gray-50 text-gray-700 ring-1 ring-black/[0.06] active:bg-gray-100",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}
