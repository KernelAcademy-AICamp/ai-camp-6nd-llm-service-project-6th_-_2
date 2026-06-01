"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { StoreCard } from "./StoreCard";
import type { FeedCard } from "@/lib/naver/cache";

export type StoreSection = {
  key: string;
  title: string; // 카테고리 제목 (예: "배달")
  shortLabel: string; // 아이콘 라벨 (예: "배달")
  emoji: string;
  cards: FeedCard[];
};

export function StoreFeedTabs({
  sections,
  userLabel,
}: {
  sections: StoreSection[];
  userLabel: string;
}) {
  const [active, setActive] = useState(sections[0]?.key ?? "");
  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div>
      {/* 카테고리 아이콘 행 — 가로 스크롤 */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {sections.map((s) => {
          const on = s.key === current?.key;
          return (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className="flex shrink-0 flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border text-xl transition",
                  on
                    ? "border-brand bg-brand-50"
                    : "border-zinc-200 bg-white",
                )}
                aria-hidden
              >
                {s.emoji}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  on ? "text-brand" : "text-zinc-500",
                )}
              >
                {s.shortLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* 맞춤 정보 헤더 */}
      <h2 className="mb-2 mt-5 text-base font-bold text-zinc-900">
        {userLabel}님을 위한 맞춤 정보
      </h2>

      {/* 활성 카테고리 카드 목록 */}
      <div className="flex flex-col gap-2">
        {current && current.cards.length > 0 ? (
          current.cards.map((card, i) => (
            <StoreCard
              key={`${current.key}-${i}`}
              title={card.title}
              subtitle={card.subtitle}
              link={card.link}
              image={card.image}
            />
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-400">
            아직 추천할 정보가 없어요.
          </p>
        )}
      </div>
    </div>
  );
}
