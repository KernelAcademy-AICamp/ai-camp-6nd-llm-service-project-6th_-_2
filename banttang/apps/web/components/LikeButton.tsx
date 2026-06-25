"use client";

// 스토어 카드 좋아요(하트) 버튼.
// favorite 가 주어지면 toggleStoreFavorite 로 영구 저장(마이페이지 찜 목록에 노출).
// 없으면 화면 토글만(비영구) 폴백. 클릭이 카드 링크로 새지 않게 prevent/stop.

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toggleStoreFavorite } from "@/app/_actions/store-favorites";
import type { StoreFavoriteInput } from "@/lib/types";

export function LikeButton({
  className,
  favorite,
  initialLiked = false,
}: {
  className?: string;
  // 찜 저장에 필요한 항목 정보. 없으면 비영구 토글.
  favorite?: StoreFavoriteInput | null;
  initialLiked?: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [pending, startTransition] = useTransition();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!favorite) {
      setLiked((v) => !v); // 비영구 폴백
      return;
    }
    const next = !liked;
    setLiked(next); // 낙관적 반영
    startTransition(async () => {
      const res = await toggleStoreFavorite(favorite);
      // 실패하면 롤백, 성공하면 서버가 알려준 최종 상태로.
      setLiked(res.ok ? res.data.favorited : !next);
    });
  }

  return (
    <button
      type="button"
      aria-label={liked ? "찜 취소" : "찜하기"}
      aria-pressed={liked}
      disabled={pending}
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur transition active:scale-90 disabled:opacity-70",
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
