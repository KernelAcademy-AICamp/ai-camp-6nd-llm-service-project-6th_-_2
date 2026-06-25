"use client";

// 핫딜 즉시 갱신 버튼 — cron(매시) 대신 RSS 재수집. 액션 후 router.refresh().

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshHotDeals } from "@/app/_actions/hotdeal";

export function RefreshHotDealsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await refreshHotDeals();
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
        {pending ? "수집 중…" : "↻ 핫딜 갱신"}
      </button>
    </span>
  );
}
