"use client";

// 테스트용 — 프로필로 생성된 추천 검색어(buildSearchQueries 결과)를 모달로 보여준다.
// 어떤 검색어로 네이버를 호출하는지 눈으로 확인하는 디버그 패널.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { SearchQuery } from "@/lib/naver/query-builder";

const SECTION_LABEL: Record<string, string> = {
  delivery: "배달",
  grocery: "장보기",
  household: "생활템",
  local_news: "동네소식",
};

export function StoreDebugQueries({ queries }: { queries: SearchQuery[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 열렸을 때 body 스크롤 잠금 + Escape 닫기
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="shrink-0">
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-500 transition hover:border-zinc-400"
      >
        🔍 검색어 ({queries.length})
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center px-5"
            role="presentation"
            onClick={() => setOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Card */}
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="debug-queries-title"
              onClick={(e) => e.stopPropagation()}
              className="relative flex max-h-[70vh] w-full max-w-[360px] flex-col rounded-[20px] bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-2 border-b border-zinc-100 p-5 pb-3">
                <div>
                  <h2 id="debug-queries-title" className="text-[17px] font-bold text-gray-900">
                    추천 검색어 ({queries.length})
                  </h2>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    프로필 → 생성된 네이버 검색어 (테스트용)
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="닫기"
                  className="-mr-1 -mt-1 rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100"
                >
                  ✕
                </button>
              </div>

              <ul className="flex flex-col gap-1.5 overflow-y-auto p-5 pt-3">
                {queries.map((q, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px]">
                    <span
                      className={cn(
                        "shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500",
                      )}
                    >
                      {SECTION_LABEL[q.section] ?? q.section}/{q.type}
                    </span>
                    <span className="text-zinc-800">{q.query}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
