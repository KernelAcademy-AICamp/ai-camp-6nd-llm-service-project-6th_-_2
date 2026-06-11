"use client";

// 스토어 추천 피드 갱신 버튼 — 1시간 캐시를 무시하고 네이버를 다시 호출한다.
// 성공하면 라우터 새로고침으로 갱신된 피드를 즉시 반영.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshStoreFeed } from "@/app/_actions/refresh-store-feed";
import { cn } from "@/lib/utils";

export function StoreRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await refreshStoreFeed();
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="shrink-0">
      <button
        onClick={onClick}
        disabled={pending}
        title={error ?? "추천 피드 새로고침"}
        className={cn(
          "rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-500 transition hover:border-zinc-400 disabled:opacity-50",
          error && "border-rose-300 text-rose-500",
        )}
      >
        <span className={cn("mr-1 inline-block", pending && "animate-spin")} aria-hidden>
          ↻
        </span>
        {pending ? "갱신 중…" : "갱신"}
      </button>
    </div>
  );
}
