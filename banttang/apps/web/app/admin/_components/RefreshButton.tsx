"use client";

// 운영자 화면 공용 새로고침 — 서버 컴포넌트 데이터를 다시 불러온다(router.refresh).

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className="rounded-full border border-brand/30 bg-white px-3 py-1.5 text-[12px] font-semibold text-brand-dark transition-colors hover:bg-brand-50 active:bg-brand-100 disabled:opacity-50"
    >
      {pending ? "새로고침 중…" : "↻ 새로고침"}
    </button>
  );
}
