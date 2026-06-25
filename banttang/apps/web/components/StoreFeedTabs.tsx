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

// "추천" 탭 — 배달 탭 앞에 두는 통합 탭. 섹션별 헤더 + 가로 스크롤 레일로 보여준다.
const RECOMMEND_KEY = "recommend";

function banttangHrefFor(card: FeedCard): string {
  // 모든 카드에 "반띵" 버튼 — 가게명/상품명 프리필해 모집글 생성으로 이동.
  const params = new URLSearchParams({ store: card.title });
  // 네이버 쇼핑 결과(shop)는 장보기 탭으로 열고, 그 쇼핑 링크를 링크 필드에 프리필.
  if (card.type === "shop") {
    params.set("tab", "shopping");
    params.set("link", card.link);
  }
  // 카드 이미지가 있으면 상품 사진으로도 프리필.
  if (card.image) params.set("image", card.image);
  return `/host/new?${params.toString()}`;
}

export function StoreFeedTabs({
  sections,
  userLabel,
  regionLabel,
  recommendSections,
  favoritedLinks,
}: {
  sections: StoreSection[];
  userLabel: string;
  regionLabel: string;
  // 추천 탭 전용 — 내 맞춤 검색어로 채운 섹션. 비어있으면 동네 피드로 폴백.
  recommendSections?: StoreSection[];
  // 이미 찜한 항목 link 목록 — 카드 하트 초기 상태.
  favoritedLinks?: string[];
}) {
  // 기본 진입은 "추천" 탭.
  const [active, setActive] = useState(RECOMMEND_KEY);

  const favSet = new Set(favoritedLinks ?? []);
  // 음식점/주변마켓(local) = store, 쇼핑(shop) = product.
  const favoritePropsFor = (card: FeedCard) => ({
    favoriteKind: (card.type === "shop" ? "product" : "store") as "store" | "product",
    initialFavorited: favSet.has(card.link),
  });

  const isRecommend = active === RECOMMEND_KEY;
  const currentSection = sections.find((s) => s.key === active);
  const currentCards = currentSection?.cards ?? [];
  // 추천 탭에 보일 섹션: 맞춤 검색어 결과가 있으면 그것, 없으면 동네 피드 집계로 폴백.
  const recommendList =
    recommendSections && recommendSections.length > 0
      ? recommendSections
      : sections.filter((s) => s.cards.length > 0);

  return (
    <div>
      {/* 카테고리 아이콘 행 — 가로 스크롤. "추천"을 맨 앞(배달 앞)에 둔다. */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <TabIcon
          emoji="✨"
          label="추천"
          on={isRecommend}
          onClick={() => setActive(RECOMMEND_KEY)}
        />
        {sections.map((s) => (
          <TabIcon
            key={s.key}
            emoji={s.emoji}
            label={s.shortLabel}
            on={s.key === active}
            onClick={() => setActive(s.key)}
          />
        ))}
      </div>

      {/* 헤더 — 추천이면 맞춤 인트로, 개별 섹션이면 그 섹션 제목 */}
      <div className="mb-4 mt-6">
        {isRecommend ? (
          <>
            <p className="text-[11px] font-bold tracking-wide text-brand">
              ✨ {userLabel}님 맞춤
            </p>
            <h2 className="mt-1 text-[19px] font-extrabold leading-tight text-zinc-900">
              {regionLabel} 이웃과 함께 사면 좋은 것들
            </h2>
          </>
        ) : (
          <h2 className="flex items-center gap-2 text-[19px] font-extrabold leading-tight text-zinc-900">
            <span aria-hidden>{currentSection?.emoji}</span>
            {currentSection?.title}
          </h2>
        )}
      </div>

      {isRecommend ? (
        // 추천 탭 — 섹션별 헤더 + 가로 스크롤 레일 (맞춤 검색어 결과, 없으면 동네 피드)
        recommendList.length > 0 ? (
          <div className="flex flex-col gap-7">
            {recommendList.map((s) => (
              <section key={s.key}>
                <h3 className="mb-3 flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-base"
                    aria-hidden
                  >
                    {s.emoji}
                  </span>
                  <span className="text-[15px] font-bold leading-snug text-zinc-900">
                    {s.title}
                  </span>
                </h3>
                {/* -mx-4 px-4 로 화면 좌우 끝까지 흐르는 레일 (부모 main 의 px-4 상쇄) */}
                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                  {s.cards.map((card, i) => (
                    <div
                      key={`${s.key}-${i}`}
                      className="w-[15rem] shrink-0 [&>div]:h-full [&>div]:w-full"
                    >
                      <StoreCard
                        title={card.title}
                        subtitle={card.subtitle}
                        link={card.link}
                        image={card.image}
                        banttangHref={banttangHrefFor(card)}
                        {...favoritePropsFor(card)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyCards />
        )
      ) : (
        // 개별 섹션 탭 — 한 줄에 2개씩 그리드
        currentCards.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {currentCards.map((card, i) => (
              <StoreCard
                key={`${active}-${i}`}
                title={card.title}
                subtitle={card.subtitle}
                link={card.link}
                image={card.image}
                banttangHref={banttangHrefFor(card)}
                {...favoritePropsFor(card)}
              />
            ))}
          </div>
        ) : (
          <EmptyCards />
        )
      )}
    </div>
  );
}

function EmptyCards() {
  return (
    <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-400">
      아직 추천할 정보가 없어요.
    </p>
  );
}

function TabIcon({
  emoji,
  label,
  on,
  onClick,
}: {
  emoji: string;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex shrink-0 flex-col items-center gap-1">
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full border text-xl transition",
          on ? "border-brand bg-brand-50" : "border-zinc-200 bg-white",
        )}
        aria-hidden
      >
        {emoji}
      </span>
      <span className={cn("text-[11px] font-medium", on ? "text-brand" : "text-zinc-500")}>
        {label}
      </span>
    </button>
  );
}
