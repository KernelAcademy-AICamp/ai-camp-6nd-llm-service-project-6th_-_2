"use client";

// 동네 대시보드 — 모집글 / 회원 탭. 각 탭 데이터는 10개씩 페이징.

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";
import { formatKstShort, levelLabel } from "@/lib/party-status";
import type { NeighborhoodParty, NeighborhoodMember } from "@/lib/admin/neighborhoods";

const PAGE_SIZE = 10;
const LEVEL_EMOJI: Record<string, string> = { dandelion: "🌼", tree: "🌳", king: "👑" };
const STATUS_META: Record<string, { label: string; cls: string }> = {
  recruiting: { label: "모집중", cls: "bg-amber-100 text-amber-700" },
  closed: { label: "마감", cls: "bg-zinc-200 text-zinc-600" },
  in_progress: { label: "진행중", cls: "bg-blue-100 text-blue-700" },
  completed: { label: "완료", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "취소", cls: "bg-red-100 text-red-700" },
};

function daysAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400_000);
  if (d <= 0) return "오늘";
  if (d < 30) return `${d}일 전`;
  return `${Math.floor(d / 30)}개월 전`;
}

type Tab = "parties" | "members";

export function NeighborhoodTabs({
  parties,
  members,
  totalParties,
  partiesDone,
  totalMembers,
}: {
  parties: NeighborhoodParty[];
  members: NeighborhoodMember[];
  totalParties: number;
  partiesDone: number;
  totalMembers: number;
}) {
  const [tab, setTab] = useState<Tab>("parties");
  const [page, setPage] = useState(1);

  const list = tab === "parties" ? parties : members;
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  const go = (t: Tab) => {
    setTab(t);
    setPage(1);
  };

  return (
    <section>
      {/* 탭 */}
      <div className="mb-2 flex gap-1.5 px-1 text-[13px] font-semibold">
        <TabBtn on={tab === "parties"} onClick={() => go("parties")} label="모집글" n={totalParties} />
        <TabBtn on={tab === "members"} onClick={() => go("members")} label="회원" n={totalMembers} />
        <span className="ml-auto self-center text-[11px] text-zinc-400">
          {tab === "parties" ? `완료 ${partiesDone}건` : "최근 활동순"}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02]">
        {pageItems.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-400">
            {tab === "parties" ? "모집글이 없어요." : "회원이 없어요."}
          </p>
        ) : tab === "parties" ? (
          (pageItems as NeighborhoodParty[]).map((p, i) => {
            const sm = STATUS_META[p.status] ?? { label: p.status, cls: "bg-zinc-100 text-zinc-500" };
            return (
              <Link
                key={p.id}
                href={`/admin/parties/${p.id}` as Route}
                className={cn("flex items-center gap-3 px-4 py-3 text-[13px] transition-colors hover:bg-brand-50/40", i > 0 && "border-t border-zinc-100")}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-bold text-zinc-900">{p.store_name}</span>
                    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", sm.cls)}>{sm.label}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                    파티장 {p.host_nickname ?? "?"} · {formatKstShort(p.created_at)}
                  </p>
                </div>
                <span className="shrink-0 text-zinc-400">›</span>
              </Link>
            );
          })
        ) : (
          (pageItems as NeighborhoodMember[]).map((m, i) => (
            <Link
              key={m.id}
              href={`/admin/members/${m.id}` as Route}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-brand-50/40",
                i > 0 && "border-t border-zinc-100",
                m.suspended && "bg-red-50/40",
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-dark">
                {m.is_bot ? "🤖" : m.nickname.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <b className={cn("font-semibold", m.suspended ? "text-zinc-400" : "text-zinc-900")}>{m.nickname}</b>
                <span className="ml-1.5 text-[11px] text-zinc-400">
                  {LEVEL_EMOJI[m.level] ?? "•"} {levelLabel[m.level] ?? m.level}
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-zinc-500">거래 {m.transaction_count}</span>
              <span className="w-14 shrink-0 text-right text-[11px] text-zinc-400">{daysAgo(m.last_active_at)}</span>
            </Link>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <PageBtn disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>이전</PageBtn>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={cn(
                "h-8 min-w-8 rounded-lg px-2 text-[13px] font-semibold transition-colors",
                p === safePage ? "bg-brand text-white" : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:bg-brand-50 hover:text-brand-dark",
              )}
            >
              {p}
            </button>
          ))}
          <PageBtn disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>다음</PageBtn>
        </div>
      )}
    </section>
  );
}

function TabBtn({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 transition-colors",
        on ? "bg-brand text-white shadow-sm shadow-brand/30" : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:bg-brand-50 hover:text-brand-dark",
      )}
    >
      {label} <span className={on ? "text-white/80" : "text-zinc-400"}>{n}</span>
    </button>
  );
}

function PageBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
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
