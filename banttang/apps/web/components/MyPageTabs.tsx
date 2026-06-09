"use client";

import { useState } from "react";
import { PartyCard } from "./PartyCard";
import { PartyCardMenu } from "./PartyCardMenu";
import { cn } from "@/lib/utils";

type Party = Parameters<typeof PartyCard>[0]["party"];
type Variant = "hosted" | "joined";
type StatusFilter = "all" | "progress" | "completed" | "cancelled";

const STATUS_CHIPS: { v: StatusFilter; label: string }[] = [
  { v: "all", label: "전체" },
  { v: "progress", label: "진행중" },
  { v: "completed", label: "완료" },
  { v: "cancelled", label: "취소" },
];

function matchStatus(filter: StatusFilter, status: string): boolean {
  if (filter === "all") return true;
  // 진행중 = 완료/취소가 아닌 모든 상태 (모집중·마감·거래중 포함)
  if (filter === "progress")
    return status === "recruiting" || status === "closed" || status === "in_progress";
  if (filter === "completed") return status === "completed";
  if (filter === "cancelled") return status === "cancelled";
  return false;
}

export function MyPageTabs({
  hosted,
  joined,
  initialTab = "hosted",
}: {
  hosted: Party[];
  joined: Party[];
  initialTab?: Variant;
}) {
  const [tab, setTab] = useState<Variant>(initialTab);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const rawItems = tab === "hosted" ? hosted : joined;
  const emptyBase = tab === "hosted" ? "아직 만든 주문이 없어요." : "아직 참여한 주문이 없어요.";

  // 반띵 시간(deal_at) 최신순 정렬 + 필터칩 적용
  const items = [...rawItems]
    .sort((a, b) => new Date(b.deal_at).getTime() - new Date(a.deal_at).getTime())
    .filter((p) => matchStatus(statusFilter, p.status));

  const emptyForFilter =
    statusFilter === "all"
      ? emptyBase
      : `해당 상태의 주문이 없어요.`;

  return (
    <div>
      {/* 상단 탭: 내가 만든 주문 / 내가 참여한 주문 */}
      <div className="flex border-b border-zinc-200">
        {[
          { v: "hosted", label: "내가 만든 주문" },
          { v: "joined", label: "내가 참여한 주문" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v as Variant)}
            className={cn(
              "flex flex-1 items-center justify-center border-b-2 py-3 text-sm font-semibold",
              tab === t.v
                ? "border-brand text-zinc-900"
                : "border-transparent text-zinc-400",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 상태 필터 칩 — 가로 스크롤 */}
      <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {STATUS_CHIPS.map((c) => {
          const active = statusFilter === c.v;
          return (
            <button
              key={c.v}
              type="button"
              onClick={() => setStatusFilter(c.v)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                active
                  ? "border-brand bg-brand text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* 카드 리스트 */}
      <div className="mt-3">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-400">
            {emptyForFilter}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((p) => (
              <PartyCard
                key={p.id}
                party={p}
                showStatus
                href={
                  p.status === "completed" || p.status === "cancelled"
                    ? `/chat/${p.id}`
                    : `/feed/${p.id}`
                }
                menu={
                  <PartyCardMenu partyId={p.id} variant={tab} status={p.status} />
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
