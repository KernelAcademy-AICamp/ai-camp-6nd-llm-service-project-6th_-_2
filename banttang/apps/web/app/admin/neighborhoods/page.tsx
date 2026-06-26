// 운영자 — 활성 동네. 주간 활성 회원순 TOP + 동네별 누적 통계 표.
//   집계: lib/admin/neighborhoods.ts

import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getNeighborhoodStats } from "@/lib/admin/neighborhoods";
import { RefreshButton } from "../_components/RefreshButton";
import { NeighborhoodTable } from "./NeighborhoodTable";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RANK_BG = ["bg-brand-dark", "bg-brand", "bg-brand-200"];

export default async function AdminNeighborhoodsPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const stats = await getNeighborhoodStats();
  const top = stats.slice(0, 3);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 bg-brand-50/40 p-4">
      <header className="flex items-end justify-between px-1 py-1">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">활성 동네</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">동네별 활동·거래 현황</p>
        </div>
        <RefreshButton />
      </header>

      {/* 활성 동네 TOP */}
      <section>
        <p className="mb-2 flex items-baseline gap-1.5 px-1">
          <span className="text-[14px] font-semibold text-zinc-700">활성 동네</span>
          <span className="text-[11px] text-zinc-400">최근 7일 · 활성 회원순</span>
        </p>
        {top.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200/70 bg-white p-8 text-center text-sm text-zinc-400 shadow-sm shadow-black/[0.02]">
            동네 데이터가 없어요.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {top.map((n, i) => (
              <Link
                key={n.id}
                href={`/admin/neighborhoods/${n.id}` as Route}
                className="rounded-2xl border border-zinc-200/70 bg-white p-3.5 shadow-sm shadow-black/[0.02] transition-colors hover:border-brand/40 hover:bg-brand-50/40"
              >
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white", RANK_BG[i] ?? "bg-brand-200")}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-zinc-900">{n.name}</p>
                    <p className="text-[10px] text-zinc-400">{n.district}</p>
                  </div>
                </div>
                <p className="mt-2.5 text-[24px] font-bold leading-none text-brand-dark">
                  {n.weeklyActive}
                  <span className="ml-0.5 text-[12px] font-medium text-zinc-400">명</span>
                </p>
                <p className="mt-1.5 text-[11px] text-zinc-500">
                  모집 {n.parties} · 성사율 {n.completionRate == null ? "—" : `${n.completionRate}%`}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 동네별 통계 표 */}
      <section>
        <p className="mb-2 flex items-baseline gap-1.5 px-1">
          <span className="text-[14px] font-semibold text-zinc-700">동네별 통계</span>
          <span className="text-[11px] text-zinc-400">전체 누적 · 베타 동네</span>
        </p>
        <NeighborhoodTable stats={stats} />
        <p className="mt-2 px-2 text-[10.5px] text-zinc-400">
          주간 활성 = 최근 7일 동네 회원 활동(검색·채팅·모집·공구) · 성사율 = 모집글→완료 누적
        </p>
      </section>
    </main>
  );
}
