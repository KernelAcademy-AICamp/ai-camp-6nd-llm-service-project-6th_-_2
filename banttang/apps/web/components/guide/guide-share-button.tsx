"use client";

// 거래 방법 안내 공유 — Web Share API, 미지원 시 클립보드 복사로 폴백.

import { useState } from "react";

export function GuideShareButton() {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url =
      typeof window !== "undefined" ? window.location.href : "https://banttang.app/guide";
    const data = {
      title: "반띵 거래 방법",
      text: "이웃과 함께 사면 더 싸게! 반띵 거래 방법을 확인해보세요.",
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch {
      // 사용자가 공유 시트를 닫은 경우 등 — 폴백으로 진행하지 않음
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 클립보드도 막힌 환경 — 조용히 무시
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-[14px] font-bold text-white transition active:scale-[0.98]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 16V4m0 0L8 8m4-4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {copied ? "링크 복사됨" : "공유하기"}
    </button>
  );
}
