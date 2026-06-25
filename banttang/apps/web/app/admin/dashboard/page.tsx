// 운영자 — 회원 활동 대시보드.
//   DAU/WAU·끈끈도·거래 성사율 · 일별 활성 · 행동 분포 · 활성화 퍼널 · 최근 활동.
//   docs/admin-user-management.md §9 Phase 4

import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getDashboardStats } from "@/lib/admin/dashboard";
import { RefreshButton } from "../_components/RefreshButton";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KIND_EMOJI: Record<string, string> = {
  search: "🔍",
  click: "👆",
  favorite: "❤️",
  groupbuy: "👥",
  party_open: "📣",
  party_join: "🤝",
};

// 행동 → 사람이 읽는 동사구. 모집글(공구) 개설/참여 포함.
const KIND_VERB: Record<string, string> = {
  search: "검색",
  favorite: "찜",
  groupbuy: "공구 참여",
  party_open: "공구 모집 시작",
  party_join: "공구 참여",
  click: "클릭",
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

export default async function AdminDashboardPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const s = await getDashboardStats();
  const maxDaily = Math.max(1, ...s.daily.map((d) => d.count));

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-3 bg-brand-50/40 p-4">
      <header className="flex items-center justify-between px-1 py-1">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">대시보드</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">띵동 회원 활동 한눈에 보기</p>
        </div>
        <RefreshButton />
      </header>

      {/* 지표 카드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="DAU" value={s.dau} />
        <Metric label="WAU" value={s.wau} />
        <Metric
          label="끈끈도 DAU/WAU"
          value={s.stickiness}
          note={Number(s.stickiness) >= 0.3 ? "목표 0.30 ✓" : "목표 0.30"}
          noteColor={Number(s.stickiness) >= 0.3 ? "text-brand-dark" : "text-zinc-400"}
        />
        <Metric
          label="주간 거래 성사율"
          value={s.dealRate == null ? "—" : `${s.dealRate}%`}
          note={s.dealRate != null && s.dealRate >= 40 ? "목표 40% ✓" : "목표 40%"}
          noteColor={s.dealRate != null && s.dealRate >= 40 ? "text-brand-dark" : "text-red-500"}
        />
      </div>

      {/* 일별 활성 회원 */}
      <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] font-semibold text-zinc-700">일별 활성 회원</span>
          <span className="text-[11px] text-zinc-400">최근 14일</span>
        </div>
        <div className="mt-3 flex gap-1.5">
          {s.daily.map((d, i) => {
            const isToday = i === s.daily.length - 1;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full flex-col items-center justify-end gap-1">
                  <span className="text-[10px] font-semibold leading-none text-zinc-500">
                    {d.count > 0 ? d.count : ""}
                  </span>
                  <div
                    className={cn("w-full rounded-t transition-colors", d.count > 0 ? "bg-brand hover:bg-brand-dark" : "bg-brand-100")}
                    style={{ height: `${d.count > 0 ? Math.max(6, (d.count / maxDaily) * 100) : 3}%` }}
                    title={`${d.label}: ${d.count}명`}
                  />
                </div>
                <span className={cn("text-[9px] leading-none", isToday ? "font-bold text-brand-dark" : "text-zinc-400")}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        {/* 행동 분포 */}
        <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-4">
          <p className="mb-3 flex items-baseline gap-1.5">
            <span className="text-[14px] font-semibold text-zinc-700">행동 분포</span>
            <span className="text-[11px] text-zinc-400">최근 14일 · 건수</span>
          </p>
          {s.distribution.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-400">활동 데이터가 없어요.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {s.distribution.map((d) => (
                <div key={d.label} className="flex items-center gap-3 text-[12.5px]">
                  <span className="w-16 shrink-0 text-zinc-600">{d.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-50">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${d.pct}%` }} />
                  </div>
                  <span className="shrink-0 text-right font-semibold text-zinc-700">
                    {d.pct}% <span className="font-normal text-zinc-400">({d.count}건)</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 활성화 퍼널 */}
        <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-4">
          <p className="mb-3 flex items-baseline gap-1.5">
            <span className="text-[14px] font-semibold text-zinc-700">활성화 퍼널</span>
            <span className="text-[11px] text-zinc-400">전체 누적 · 회원수</span>
          </p>
          <div className="flex flex-col gap-2">
            {s.funnel.map((f) => (
              <div key={f.label} className="flex items-center gap-2">
                <div
                  className="flex h-8 items-center rounded-lg bg-brand px-2.5 text-[12px] font-semibold text-white"
                  style={{ width: `${Math.max(18, f.pct)}%`, minWidth: "5.5rem" }}
                >
                  {f.label} {f.count}
                </div>
                <span className="text-[11px] text-zinc-400">{f.pct}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 최근 활동 */}
      <section className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[14px] font-semibold text-zinc-700">최근 활동</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-dark">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            실시간
          </span>
        </div>
        {s.recent.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400">최근 활동이 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {s.recent.map((r, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[13px]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px]">
                  {KIND_EMOJI[r.kind] ?? "•"}
                </span>
                <span className="min-w-0 flex-1 truncate text-zinc-700">
                  {r.user_id ? (
                    <Link
                      href={`/admin/members/${r.user_id}` as Route}
                      className="font-semibold text-zinc-900 underline-offset-2 hover:text-brand-dark hover:underline"
                    >
                      {r.nickname}
                    </Link>
                  ) : (
                    <b className="font-semibold">{r.nickname}</b>
                  )}
                  님이 ‘{r.keyword}’ {KIND_VERB[r.kind] ?? "활동"}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400">{timeAgo(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  note,
  noteColor,
}: {
  label: string;
  value: number | string;
  note?: string;
  noteColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02] p-3">
      <p className="text-[12.5px] text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
      {note && <p className={`mt-0.5 text-[11px] ${noteColor ?? "text-zinc-400"}`}>{note}</p>}
    </div>
  );
}
