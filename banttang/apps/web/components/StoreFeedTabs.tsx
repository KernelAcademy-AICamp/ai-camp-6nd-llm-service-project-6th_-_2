"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { StoreThumb } from "./StoreThumb";
import type { FeedCard } from "@/lib/naver/cache";

export type StoreSection = {
  key: string;
  title: string; // 섹션 제목 (예: "우리 동네 배달 맛집")
  shortLabel: string; // 탭 라벨 (예: "배달")
  emoji: string;
  cards: FeedCard[];
};

// 피드 카드 1장. 외부 링크가 있으면 클릭 가능, 없으면(일부 지역검색) 정적 카드.
function FeedCardItem({ card }: { card: FeedCard }) {
  const inner = (
    <>
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-50">
        {card.image ? (
          // 외부 이미지(쇼핑) — next/image 도메인 설정 회피 위해 background 로 표시
          <div
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${card.image})` }}
            aria-hidden
          />
        ) : (
          <StoreThumb storeName={card.title} menu={card.subtitle} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">
          {card.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{card.subtitle}</p>
      </div>
    </>
  );

  const cls = "flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition";

  if (card.link) {
    return (
      <a
        href={card.link}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cls} hover:border-brand/40 hover:shadow-sm`}
      >
        {inner}
      </a>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export function StoreFeedTabs({ sections }: { sections: StoreSection[] }) {
  const [active, setActive] = useState(sections[0]?.key ?? "");
  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div>
      {/* 탭 바 — 4개라 가로 스크롤 허용 */}
      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={cn(
              "flex shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold",
              s.key === current?.key
                ? "border-brand text-zinc-900"
                : "border-transparent text-zinc-400",
            )}
          >
            <span aria-hidden>{s.emoji}</span>
            {s.shortLabel}
          </button>
        ))}
      </div>

      {/* 활성 섹션 카드 목록 */}
      <div className="mt-4 flex flex-col gap-2">
        {current?.cards.map((card, i) => (
          <FeedCardItem key={`${current.key}-${i}`} card={card} />
        ))}
      </div>
    </div>
  );
}
