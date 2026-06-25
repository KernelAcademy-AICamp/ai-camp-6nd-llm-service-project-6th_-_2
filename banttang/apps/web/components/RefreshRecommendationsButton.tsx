"use client";

// AI 추천 즉시 생성 버튼 — cron(매시) 대신 사용자가 수동 갱신.
// 액션 후 router.refresh()로 스토어 데이터를 다시 불러온다.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshMyRecommendations } from "@/app/_actions/recommend";

export function RefreshRecommendationsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await refreshMyRecommendations();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-[11px] text-red-500">{error}</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition-colors active:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "생성 중…" : "↻ AI 추천 갱신"}
      </button>
    </span>
  );
}
