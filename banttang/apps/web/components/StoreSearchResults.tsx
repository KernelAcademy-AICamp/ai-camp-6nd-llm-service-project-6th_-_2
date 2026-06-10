"use client";

// 스토어 검색 결과 — 세그먼트 탭으로 [음식점 | 쇼핑] 전환.
// 서버(page.tsx)에서 두 결과를 카드 데이터로 만들어 넘겨주고,
// 여기선 탭 상태만 들고 활성 탭의 리스트를 렌더한다(재검색 없음).

import { useState } from "react";
import { cn } from "@/lib/utils";
import { StoreCard, type StoreCardData } from "./StoreCard";

type Tab = "food" | "shop";

export function StoreSearchResults({
  query,
  foodCards,
  shopCards,
}: {
  query: string;
  foodCards: StoreCardData[];
  shopCards: StoreCardData[];
}) {
  // 결과가 있는 쪽을 기본 탭으로. 둘 다 있으면 음식점 먼저.
  const [tab, setTab] = useState<Tab>(foodCards.length === 0 && shopCards.length > 0 ? "shop" : "food");

  const cards = tab === "food" ? foodCards : shopCards;

  return (
    <div className="flex flex-col gap-3">
      {/* 세그먼트 탭 */}
      <div className="flex rounded-xl bg-zinc-100 p-1">
        <TabButton active={tab === "food"} onClick={() => setTab("food")}>
          음식점 {foodCards.length > 0 && <Count>{foodCards.length}</Count>}
        </TabButton>
        <TabButton active={tab === "shop"} onClick={() => setTab("shop")}>
          쇼핑 {shopCards.length > 0 && <Count>{shopCards.length}</Count>}
        </TabButton>
      </div>

      <h2 className="text-sm font-bold text-zinc-800">
        ‘{query}’ {tab === "food" ? "음식점" : "상품"} 검색 결과
      </h2>

      {cards.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {cards.map((c, i) => (
            <StoreCard key={`${tab}-${i}`} {...c} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-400">
          {tab === "food" ? "음식점 검색 결과가 없어요." : "상품 검색 결과가 없어요."}
        </p>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition",
        active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
      )}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-brand-50 px-1.5 text-[11px] font-bold text-brand">
      {children}
    </span>
  );
}
