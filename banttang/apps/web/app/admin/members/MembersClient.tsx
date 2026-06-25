"use client";

// 회원 목록 — 검색·필터·정렬(클라이언트) + 상태 배지. 행 클릭 → 상세 콘솔.
//   docs/admin-user-management.md §9 Phase 1

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";
import { levelLabel } from "@/lib/party-status";
import type { AdminMemberItem } from "@/lib/admin-queries";

type Filter = "all" | "new" | "admin" | "bot" | "suspended";
type Sort = "active" | "joined" | "tx" | "trust";

const PAGE_SIZE = 10;

const DAY = 86400_000;
const isActive7d = (m: AdminMemberItem) =>
  Date.now() - Date.parse(m.last_active_at) < 7 * DAY;

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  if (d <= 0) return "오늘";
  if (d < 30) return `${d}일 전`;
  return `${Math.floor(d / 30)}개월 전`;
}

export function MembersClient({ members }: { members: AdminMemberItem[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("active");
  const [page, setPage] = useState(1);

  // 검색·필터·정렬이 바뀌면 1페이지로 리셋
  useEffect(() => setPage(1), [q, filter, sort]);

  const stats = useMemo(
    () => ({
      all: members.length,
      active: members.filter(isActive7d).length,
      bot: members.filter((m) => m.is_bot).length,
      suspended: members.filter((m) => m.suspended_at).length,
    }),
    [members],
  );

  const rows = useMemo(() => {
    const kw = q.trim();
    let list = members.filter((m) => (kw ? m.nickname.includes(kw) : true));
    list = list.filter((m) => {
      switch (filter) {
        case "new": return m.transaction_count === 0;
        case "admin": return m.is_admin;
        case "bot": return m.is_bot;
        case "suspended": return !!m.suspended_at;
        default: return true;
      }
    });
    const by: Record<Sort, (a: AdminMemberItem, b: AdminMemberItem) => number> = {
      active: (a, b) => b.last_active_at.localeCompare(a.last_active_at),
      joined: (a, b) => b.joined_at.localeCompare(a.joined_at),
      tx: (a, b) => b.transaction_count - a.transaction_count,
      trust: (a, b) => b.good_review_count - a.good_review_count,
    };
    return [...list].sort(by[sort]);
  }, [members, q, filter, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "전체", n: stats.all },
    { key: "new", label: "신규", n: members.filter((m) => m.transaction_count === 0).length },
    { key: "admin", label: "운영자", n: members.filter((m) => m.is_admin).length },
    { key: "bot", label: "봇", n: stats.bot },
    { key: "suspended", label: "제재", n: stats.suspended },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 요약 통계 */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { k: "전체", v: stats.all, c: "" },
          { k: "주간 활성", v: stats.active, c: "text-emerald-600" },
          { k: "봇", v: stats.bot, c: "text-violet-600" },
          { k: "제재", v: stats.suspended, c: "text-red-500" },
        ].map((s) => (
          <div key={s.k} className="rounded-2xl border border-black/[0.04] bg-white p-3 text-center">
            <p className={cn("text-xl font-bold text-zinc-900", s.c)}>{s.v}</p>
            <p className="text-[12.5px] text-zinc-500">{s.k}</p>
          </div>
        ))}
      </div>

      {/* 검색 + 정렬 */}
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="닉네임 검색"
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-zinc-400"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-[15px] text-zinc-600"
        >
          <option value="active">최근 활동순</option>
          <option value="joined">가입 최신순</option>
          <option value="tx">거래 많은순</option>
          <option value="trust">신뢰점수순</option>
        </select>
      </div>

      {/* 필터 칩 */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[14px] font-semibold transition-colors",
              filter === c.key
                ? "bg-brand-50 text-brand-dark ring-1 ring-brand-100"
                : "bg-white text-zinc-500 ring-1 ring-zinc-200",
            )}
          >
            {c.label} <span className="text-zinc-400">{c.n}</span>
          </button>
        ))}
      </div>

      {/* 목록 (테이블) */}
      <p className="px-1 text-[13px] text-zinc-400">
        {rows.length}명{rows.length > PAGE_SIZE && ` · ${safePage}/${totalPages} 페이지`}
      </p>
      {rows.length === 0 ? (
        <p className="px-1 py-12 text-center text-[15px] text-zinc-500">해당 회원이 없어요.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm shadow-black/[0.02]">
          {/* 헤더 */}
          <div className={cn(COLS, "items-center border-b border-zinc-100 bg-zinc-50/70 px-4 py-2.5 text-[12px] font-semibold text-zinc-400")}>
            <span>사용자</span>
            <span>등급</span>
            <span className="text-right">거래·후기</span>
            <span className="pl-4">상태</span>
            <span />
          </div>
          {pagedRows.map((m, i) => (
            <Link
              key={m.id}
              href={`/admin/members/${m.id}` as Route}
              className={cn(
                COLS,
                "items-center px-4 py-3 transition-colors hover:bg-brand-50/40",
                i > 0 && "border-t border-zinc-100",
                m.suspended_at && "bg-red-50/40",
              )}
            >
              {/* 사용자 */}
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-bold text-zinc-500">
                  {m.is_bot ? "🤖" : m.nickname.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <span className={cn("block truncate text-[15.5px] font-bold", m.suspended_at ? "text-zinc-400" : "text-zinc-900")}>
                    {m.nickname}
                  </span>
                  <p className="truncate text-[12.5px] text-zinc-500">
                    {[m.neighborhood_name ?? "동네 미설정", `최근 ${daysAgo(m.last_active_at)}`].join(" · ")}
                  </p>
                </div>
              </div>
              {/* 등급 */}
              <div className="flex items-center gap-1 truncate text-[13px] text-zinc-600">
                <span aria-hidden>{LEVEL_EMOJI[m.level] ?? "•"}</span>
                <span className="truncate">{levelLabel[m.level] ?? m.level}</span>
              </div>
              {/* 거래·후기 */}
              <div className="text-right text-[12.5px] text-zinc-500">
                <p>거래 <b className="text-zinc-800">{m.transaction_count}</b></p>
                <p>
                  <span className="text-emerald-600">+{m.good_review_count}</span>
                  <span className="text-zinc-300"> / </span>
                  <span className="text-red-400">-{m.bad_review_count}</span>
                </p>
              </div>
              {/* 상태 */}
              <div className="flex flex-wrap gap-1 pl-4">
                {m.is_admin && <Badge className="bg-brand-dark text-white">운영자</Badge>}
                {m.is_bot && <Badge className="bg-violet-100 text-violet-700">봇</Badge>}
                {m.suspended_at ? (
                  <Badge className="bg-red-100 text-red-700">제재</Badge>
                ) : m.transaction_count === 0 ? (
                  <Badge className="bg-emerald-100 text-emerald-700">신규</Badge>
                ) : (
                  !m.is_admin && !m.is_bot && <span className="text-[12px] text-zinc-400">정상</span>
                )}
              </div>
              {/* 동작 */}
              <span className="text-right text-zinc-300">›</span>
            </Link>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
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
    </div>
  );
}

// 헤더·행 공통 그리드 컬럼: 사용자(flex) · 등급 · 거래·후기 · 상태 · 동작(›)
const COLS = "grid grid-cols-[minmax(0,1fr)_70px_100px_116px_14px] gap-3";

// 신뢰 등급별 아이콘 (level: dandelion/tree/king)
const LEVEL_EMOJI: Record<string, string> = {
  dandelion: "🌼",
  tree: "🌳",
  king: "👑",
};

function PageBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 rounded-lg px-2.5 text-[13px] font-semibold text-zinc-500 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}
