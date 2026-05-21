import { Suspense } from "react";
import { LoginForm } from "./login-form";

// dev/MVP용 로그인 페이지.
// 카카오 OAuth 도입 전까지 이메일+비밀번호로 빠르게 세션을 만든다.
// "관리자 계정 생성" 버튼은 Server Action으로 admin API를 호출 — 이메일 인증 스킵.
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-brand">반띵</h1>
        <p className="mt-1 text-xs text-foreground/60">
          dev 로그인 — 카카오 OAuth는 이후 작업
        </p>
      </header>

      <Suspense fallback={<p className="text-center text-sm">로딩…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
