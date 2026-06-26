"use client";

// 성향 태그 즉시 재집계 버튼 — cron(매시) 대신 운영자가 수동 갱신.
// 액션 후 router.refresh()로 force-dynamic 페이지 데이터를 다시 불러온다.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminRefreshUserTags } from "@/app/_actions/admin";

export function RefreshTagsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await adminRefreshUserTags();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] text-red-500">{error}</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-semibold text-zinc-600 transition-colors active:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "집계 중…" : "↻ 지금 갱신"}
      </button>
    </div>
  );
}
