"use client";

// 맨 위로 가기 버튼 — 스크롤을 일정 이상 내리면 우측 하단(BottomNav 위)에 나타난다.
// 페이지(window) 스크롤 기준. max-w-md 중앙 컬럼의 오른쪽 끝에 정렬.

import { useEffect, useState } from "react";

const SHOW_AFTER_PX = 300;

export function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    // 래퍼는 클릭 통과(pointer-events-none), 버튼만 클릭 가능. BottomNav(z-30, 높이 ≈ 3.5rem) 위로.
    // 버튼을 in-flow + justify-end 로 두어 래퍼 하단(bottom-[4.5rem])에 우측 정렬.
    <div className="pointer-events-none fixed bottom-[4.5rem] left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 justify-end px-4">
      <button
        type="button"
        aria-label="맨 위로"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-lg transition active:scale-95"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}
