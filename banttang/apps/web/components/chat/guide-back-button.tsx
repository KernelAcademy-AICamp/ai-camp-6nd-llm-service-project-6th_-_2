"use client";

import { useRouter } from "next/navigation";

// 거래 방법 안내 페이지 상단 뒤로가기 — 이전 화면(들어온 채팅방)으로 복귀.
export function GuideBackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="뒤로"
      className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 active:bg-black/5"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
