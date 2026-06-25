// 운영자 — 동네 대시보드. 단일 동네의 핵심 지표 + 일별 활성(14일) + 최근 모집글.
//   집계: lib/admin/neighborhoods.ts getNeighborhoodDetail

import Link from "next/link";
import type { Route } from "next";
import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getNeighborhoodDetail } from "@/lib/admin/neighborhoods";
import { RefreshButton } from "../../_components/RefreshButton";
import { NeighborhoodTabs } from "./NeighborhoodTabs";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NeighborhoodDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const d = await getNeighborhoodDetail(params.id);
  if (!d) notFound();
  const maxDaily = Math.max(1, ...d.daily.map((x) => x.count));

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 bg-brand-50/40 p-4">
      <header className="flex items-end justify-between px-1 py-1">
        <div className="flex items-center gap-2">
          <Link href={"/admin/neighborhoods" as Route} className="text-lg text-zinc-500" aria-label="목록">‹</Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{d.name}</h1>
            <p className="mt-0.5 text-[12px] text-zinc-500">{d.district} · 동네 대시보드</p>
          </div>
        </div>
        <RefreshButton />
      </header>

      {/* 지표 카드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Metric label="회원" value={d.members} />
        <Metric label="주간 활성" value={d.weeklyActive} accent />
        <Metric label="모집글" value={d.parties} />
        <Metric
          label="성사율"
          value={d.completionRate == null ? "—" : `${d.completionRate}%`}
          accent={d.completionRate != null && d.completionRate >= 40}
        />
        <Metric label="공구" value={d.groupBuys} />
      </div>

      {/* 일별 활성 회원 */}
      <section className="rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm shadow-black/[0.02]">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[14px] font-semibold text-zinc-700">일별 활성 회원</span>
          <span className="text-[11px] text-zinc-400">최근 14일</span>
        </p>
        <div className="mt-3 flex gap-1.5">
          {d.daily.map((x, i) => {
            const isToday = i === d.daily.length - 1;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-28 w-full flex-col items-center justify-end gap-1">
                  <span className="text-[10px] font-semibold leading-none text-zinc-500">{x.count > 0 ? x.count : ""}</span>
                  <div
                    className={cn("w-full rounded-t", x.count > 0 ? "bg-brand" : "bg-brand-100")}
                    style={{ height: `${x.count > 0 ? Math.max(6, (x.count / maxDaily) * 100) : 3}%` }}
                    title={`${x.label}: ${x.count}명`}
                  />
                </div>
                <span className={cn("text-[9px] leading-none", isToday ? "font-bold text-brand-dark" : "text-zinc-400")}>{x.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 행동 분포 */}
      <section className="rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm shadow-black/[0.02]">
        <p className="mb-3 flex items-baseline gap-1.5">
          <span className="text-[14px] font-semibold text-zinc-700">행동 분포</span>
          <span className="text-[11px] text-zinc-400">최근 14일 · 건수</span>
        </p>
        {d.distribution.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400">활동 데이터가 없어요.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {d.distribution.map((x) => (
              <div key={x.label} className="flex items-center gap-3 text-[12.5px]">
                <span className="w-16 shrink-0 text-zinc-600">{x.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-50">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${x.pct}%` }} />
                </div>
                <span className="shrink-0 text-right font-semibold text-zinc-700">
                  {x.pct}% <span className="font-normal text-zinc-400">({x.count}건)</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 모집글 / 회원 — 탭 + 페이징 */}
      <NeighborhoodTabs
        parties={d.partyList}
        members={d.memberList}
        totalParties={d.parties}
        partiesDone={d.partiesDone}
        totalMembers={d.members}
      />
    </main>
  );
}

function Metric({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white p-3 shadow-sm shadow-black/[0.02]">
      <p className="text-[12.5px] text-zinc-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", accent ? "text-brand-dark" : "text-zinc-900")}>{value}</p>
    </div>
  );
}
