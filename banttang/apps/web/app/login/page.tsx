import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[100dvh] max-w-md items-center justify-center px-5">
          <p className="text-sm text-gray-400">로딩 중…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
