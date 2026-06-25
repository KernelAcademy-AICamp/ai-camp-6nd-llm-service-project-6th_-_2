"use client";

// 테스트용 — 프로필로 생성된 추천 검색어(buildSearchQueries 결과)를 모달로 보여준다.
// 어떤 검색어로 네이버를 호출하는지 눈으로 확인하는 디버그 패널.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { SearchQuery } from "@/lib/naver/query-builder";

const SECTION_LABEL: Record<string, string> = {
  delivery: "음식점",
  market: "주변 마켓",
  food: "식품",
  health: "건강",
  living: "리빙",
  beauty: "뷰티",
  fashion: "패션",
};

// 같은 섹션의 검색어를 하나로 묶는다(중복 제거). 첫 등장 순서 유지.
type QueryGroup = { section: string; type: string; queries: string[] };
function groupBySection(qs: SearchQuery[]): QueryGroup[] {
  const order: string[] = [];
  const map = new Map<string, QueryGroup>();
  for (const q of qs) {
    let g = map.get(q.section);
    if (!g) {
      g = { section: q.section, type: q.type, queries: [] };
      map.set(q.section, g);
      order.push(q.section);
    }
    if (!g.queries.includes(q.query)) g.queries.push(q.query);
  }
  return order.map((k) => map.get(k)!);
}

// 섹션별로 묶어 한 줄에 ,로 합쳐 렌더.
function QueryGroupList({
  queries,
  badgeClass,
}: {
  queries: SearchQuery[];
  badgeClass: string;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {groupBySection(queries).map((g, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px]">
          <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", badgeClass)}>
            {SECTION_LABEL[g.section] ?? g.section}/{g.type}
          </span>
          <span className="text-zinc-800">{g.queries.join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}

export function StoreDebugQueries({
  queries,
  personalizedQueries = [],
}: {
  queries: SearchQuery[];
  // 온보딩 선호도(primary_usage + favorite_categories)로 만든 "내 맞춤 검색어"
  personalizedQueries?: SearchQuery[];
}) {
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

              <div className="overflow-y-auto p-5 pt-3">
                <QueryGroupList queries={queries} badgeClass="bg-zinc-100 text-zinc-500" />

                {/* 온보딩 선호도로 만든 내 맞춤 검색어 */}
                <div className="mt-4 border-t border-zinc-100 pt-3">
                  <p className="mb-2 text-[12px] font-bold text-brand">
                    ✨ 내 맞춤 검색어 ({personalizedQueries.length})
                  </p>
                  {personalizedQueries.length > 0 ? (
                    <QueryGroupList queries={personalizedQueries} badgeClass="bg-brand-50 text-brand" />
                  ) : (
                    <p className="text-[12px] text-zinc-400">
                      온보딩에서 저장한 선호도가 없어요.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
