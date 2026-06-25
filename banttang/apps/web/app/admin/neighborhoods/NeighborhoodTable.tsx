"use client";

// 동네별 통계 표 — 데이터가 많으면 페이지네이션(10개씩). 행 클릭 시 동네 대시보드로.

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";
import type { NeighborhoodStat } from "@/lib/admin/neighborhoods";

const PAGE_SIZE = 10;
const COLS = "grid grid-cols-[minmax(0,1.4fr)_1.2fr_56px_56px_64px_56px] items-center gap-2";

export function NeighborhoodTable({ stats }: { stats: NeighborhoodStat[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(stats.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = stats.slice(start, start + PAGE_SIZE);
  const maxActive = Math.max(1, ...stats.map((s) => s.weeklyActive)); // 바 스케일은 전체 기준 고정

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02]">
        <div className={cn(COLS, "border-b border-zinc-100 bg-brand-50/50 px-4 py-2.5 text-[12px] font-semibold text-zinc-400")}>
          <span>동네</span>
          <span>주간 활성</span>
          <span className="text-right">회원</span>
          <span className="text-right">모집글</span>
          <span className="text-right">성사율</span>
          <span className="text-right">공구</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-400">동네 데이터가 없어요.</p>
        ) : (
          rows.map((n, i) => (
            <Link
              key={n.id}
              href={`/admin/neighborhoods/${n.id}` as Route}
              className={cn(COLS, "px-4 py-3 text-[13px] transition-colors hover:bg-brand-50/40", i > 0 && "border-t border-zinc-100")}
            >
              <span className="truncate">
                <b className="font-semibold text-zinc-900">{n.name}</b>{" "}
                <span className="text-[10px] text-zinc-400">{n.district}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-50">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${Math.round((100 * n.weeklyActive) / maxActive)}%` }}
                  />
                </span>
                <span className="w-5 shrink-0 text-right text-[12px] font-semibold text-zinc-700">{n.weeklyActive}</span>
              </span>
              <span className="text-right text-zinc-600">{n.members}</span>
              <span className="text-right text-zinc-600">{n.parties}</span>
              <span
                className={cn(
                  "text-right font-semibold",
                  n.completionRate != null && n.completionRate >= 40
                    ? "text-brand-dark"
                    : n.completionRate ? "text-zinc-600" : "text-zinc-300",
                )}
              >
                {n.completionRate == null ? "—" : `${n.completionRate}%`}
              </span>
              <span className="text-right text-zinc-600">{n.groupBuys}</span>
            </Link>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <PageBtn disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
            이전
          </PageBtn>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={cn(
                "h-8 min-w-8 rounded-lg px-2 text-[13px] font-semibold transition-colors",
                p === safePage
                  ? "bg-brand text-white"
                  : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:bg-brand-50 hover:text-brand-dark",
              )}
            >
              {p}
            </button>
          ))}
          <PageBtn disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>
            다음
          </PageBtn>
        </div>
      )}
    </>
  );
}

function PageBtn({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 rounded-lg px-2.5 text-[13px] font-semibold text-zinc-500 ring-1 ring-zinc-200 transition-colors hover:bg-brand-50 hover:text-brand-dark disabled:opacity-40"
    >
      {children}
    </button>
  );
}
