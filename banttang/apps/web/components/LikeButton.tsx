"use client";

// 스토어 카드 좋아요(하트) 버튼 — 화면 토글만(비영구).
// 카드 본문 링크와 형제로 두고, 클릭이 링크로 새지 않게 stopPropagation/preventDefault.

import { useState } from "react";
import { cn } from "@/lib/utils";

export function LikeButton({ className }: { className?: string }) {
  const [liked, setLiked] = useState(false);

  return (
    <button
      type="button"
      aria-label={liked ? "좋아요 취소" : "좋아요"}
      aria-pressed={liked}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setLiked((v) => !v);
      }}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur transition active:scale-90",
        className,
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={liked ? "#ef4444" : "none"}
        stroke={liked ? "#ef4444" : "#71717a"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.02-1.05a5.5 5.5 0 1 0-7.78 7.78L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  );
}
