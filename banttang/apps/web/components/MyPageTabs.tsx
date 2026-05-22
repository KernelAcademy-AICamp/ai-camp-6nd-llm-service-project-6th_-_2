"use client";

import { useState } from "react";
import { PartyCard } from "./PartyCard";
import { cn } from "@/lib/utils";

type Party = Parameters<typeof PartyCard>[0]["party"];

export function MyPageTabs({ hosted, joined }: { hosted: Party[]; joined: Party[] }) {
  const [tab, setTab] = useState<"hosted" | "joined">("hosted");
  const items = tab === "hosted" ? hosted : joined;
  const empty = tab === "hosted" ? "아직 만든 주문이 없어요." : "아직 참여한 주문이 없어요.";

  const recruiting = items.filter((p) => p.status === "recruiting");
  const inProgress = items.filter((p) => p.status === "closed" || p.status === "in_progress");
  const done = items.filter((p) => p.status === "completed" || p.status === "cancelled");

  return (
    <div>
      <div className="flex border-b border-zinc-200">
        {[
          { v: "hosted", label: "내가 만든 주문" },
          { v: "joined", label: "내가 참여한 주문" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v as "hosted" | "joined")}
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

      <div className="mt-4">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-400">
            {empty}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <Group label="대기/모집중" items={recruiting} />
            <Group label="진행중" items={inProgress} />
            <Group label="완료/취소" items={done} />
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ label, items }: { label: string; items: Party[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">{label}</p>
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
          />
        ))}
      </div>
    </div>
  );
}
