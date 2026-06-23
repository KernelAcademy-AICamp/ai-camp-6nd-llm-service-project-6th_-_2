"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { MapView } from "./MapView";
import {
  AI_PICKS,
  CATEGORIES,
  ETC_CATEGORY,
  PARTICIPATIONS,
  PRODUCTS,
  trustLabel,
  type AIPick,
  type Category,
  type Participation,
} from "./mock-data";

const PICKS_PER_PAGE = 4;

type Filter = "all" | Category["id"];

export function PrototypeV2() {
  // AI 추천 섹션 필터 (상단 칩) — 지도 필터와 독립
  const [aiFilter, setAiFilter] = useState<Filter>("all");
  // 지도(우리동네 반띵 보기) 섹션 필터 — AI와 별개로 동작
  const [mapFilter, setMapFilter] = useState<Filter>("all");
  // 지도 섹션 검색어 (상품명·브랜드·닉네임·픽업 위치 통합 검색)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [matchedWith, setMatchedWith] = useState<Participation | null>(null);

  // 지도 섹션: 카테고리 + 검색어 동시 적용
  const filteredParts = useMemo(() => {
    const byCategory =
      mapFilter === "all"
        ? PARTICIPATIONS
        : PARTICIPATIONS.filter((part) => {
            const product = PRODUCTS.find((p) => p.id === part.productId);
            return product?.categoryId === mapFilter;
          });
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((part) => {
      const product = PRODUCTS.find((p) => p.id === part.productId);
      return (
        (product?.name ?? "").toLowerCase().includes(q) ||
        (product?.brand ?? "").toLowerCase().includes(q) ||
        part.nickname.toLowerCase().includes(q) ||
        part.pickupName.toLowerCase().includes(q)
      );
    });
  }, [mapFilter, searchQuery]);

  // 지도 핀 — 카테고리 칩 + 상품명 + 반띵 시간
  const mapPins = useMemo(
    () =>
      filteredParts.map((part) => {
        const product = PRODUCTS.find((p) => p.id === part.productId);
        // etc 카테고리는 CATEGORIES에 없으니 ETC_CATEGORY로 폴백
        const cat =
          CATEGORIES.find((c) => c.id === product?.categoryId) ??
          (product?.categoryId === "etc" ? ETC_CATEGORY : null);
        return {
          id: part.id,
          lat: part.lat,
          lng: part.lng,
          emoji: cat?.emoji ?? "📍",
          label: cat?.label ?? "",
          productName: product?.name ?? "",
          timeWindow: part.timeWindow,
        };
      }),
    [filteredParts],
  );

  // 현재 선택된 핀에 해당하는 참여건 (지도 아래 상세 카드용)
  const selectedPart = useMemo(
    () =>
      selectedPinId
        ? filteredParts.find((p) => p.id === selectedPinId) ?? null
        : null,
    [selectedPinId, filteredParts],
  );

  // AI 추천 필터링 (상단 칩 기준)
  const filteredPicks = useMemo(() => {
    if (aiFilter === "all") return AI_PICKS;
    return AI_PICKS.filter((pick) => {
      const product = PRODUCTS.find((p) => p.id === pick.productId);
      return product?.categoryId === aiFilter;
    });
  }, [aiFilter]);

  // 지도 카테고리 바뀌면 선택 핀 초기화 (다른 카테고리의 핀이 남아있지 않도록)
  function handleMapFilterChange(next: Filter) {
    setMapFilter(next);
    setSelectedPinId(null);
  }
  function handleSearchChange(next: string) {
    setSearchQuery(next);
    setSelectedPinId(null);
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-zinc-50">
      <Header />
      <main className="flex-1 overflow-y-auto">
        {/* 1) "바로 반띵하기" 섹션 헤더 — 칩 위에 올려서 sticky에 가려지지 않게 함 */}
        <div className="bg-white px-4 pb-2 pt-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[18px] font-bold text-zinc-900">바로 반띵하기</h2>
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
              ✨ AI BETA
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-zinc-500">
            참여만 하면 AI가 1km 이내 참여자와 반띵을 매칭해줘요.
          </p>
        </div>

        {/* 2) 상단 카테고리 칩 — AI 추천 섹션 전용 필터 */}
        <FilterChips active={aiFilter} onChange={setAiFilter} />

        {/* 3) AI 추천 상품 슬롯 (다른 팀에서 개발 중인 호스팅 추천 기능의 UI 슬롯) */}
        <AIPicksSection
          picks={filteredPicks}
          showPagination={aiFilter === "all"}
        />

        <div className="h-2 bg-zinc-100" />

        {/* 4) 지도 섹션 — AI 추천과 독립된 자체 카테고리 필터 보유 */}
        <section className="bg-white px-4 pb-3 pt-3">
          <div className="mb-3">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[16px] font-bold text-zinc-900">
                우리동네 반띵 보기
              </h2>
              <span className="ml-auto text-[11px] text-zinc-400">
                {filteredParts.length}건
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-zinc-500">
              호스트가 직접 제안하는 반띵 주문이에요. 지도에 표시된 위치에서 만나서 거래해요.
            </p>
          </div>

          {/* 지도 섹션 검색창 — 상품명·브랜드·닉네임·픽업 위치 통합 검색 */}
          <div className="relative mb-2">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-zinc-400"
              aria-hidden
            >
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="반띵하고 싶은 상품명을 검색해 보세요. 예) 커피, 생수, 해외 직구"
              className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-9 text-[13px] placeholder:text-zinc-400 focus:border-brand focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                aria-label="검색어 지우기"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600"
              >
                ×
              </button>
            )}
          </div>

          {/* 지도 섹션 전용 카테고리 칩 — AI 추천과 별개로 동작. 기타 칩 포함. */}
          <div className="-mx-4 mb-3">
            <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  { id: "all" as Filter, label: "전체" },
                  ...CATEGORIES.map((c) => ({
                    id: c.id as Filter,
                    label: c.label,
                    emoji: c.emoji,
                  })),
                  {
                    id: ETC_CATEGORY.id as Filter,
                    label: ETC_CATEGORY.label,
                    emoji: ETC_CATEGORY.emoji,
                  },
                ] as Array<{ id: Filter; label: string; emoji?: string }>
              ).map((c) => {
                const on = mapFilter === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleMapFilterChange(c.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition active:scale-95",
                      on
                        ? "border-brand bg-brand text-white"
                        : "border-zinc-200 bg-white text-zinc-700",
                    )}
                  >
                    {c.emoji ? `${c.emoji} ` : ""}
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredParts.length > 0 ? (
            <div className="relative">
              <MapView
                pins={mapPins}
                selectedId={selectedPinId}
                onPinClick={setSelectedPinId}
              />
              <button
                type="button"
                onClick={() =>
                  alert("(목업) 내 주문(상품·위치) 등록 단계로 이동")
                }
                className="absolute right-3 top-3 z-[1] rounded-full border border-brand bg-white px-3 py-1.5 text-[11px] font-bold text-brand shadow-sm active:bg-brand/5"
              >
                + 내 주문 등록하기
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 text-center">
                <span className="text-[28px]">📍</span>
                <p className="text-[13px] font-bold text-zinc-700">
                  이 카테고리엔 아직 등록된 반띵이 없어요
                </p>
                <p className="text-[11px] text-zinc-500">
                  첫 번째로 위치를 등록하면 다른 사람이 찾아올 거예요.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  alert("(목업) 내 주문(상품·위치) 등록 단계로 이동")
                }
                className="absolute right-3 top-3 z-[1] rounded-full border border-brand bg-white px-3 py-1.5 text-[11px] font-bold text-brand shadow-sm active:bg-brand/5"
              >
                + 내 주문 등록하기
              </button>
            </div>
          )}
        </section>

        {/* 4) 선택된 주문건 상세 카드 (지도에서 핀 선택 시에만 노출) */}
        {selectedPart && (
          <>
            <div className="h-2 bg-zinc-100" />
            <section className="bg-white px-4 pb-6 pt-4">
              <ParticipationRow
                key={selectedPart.id}
                part={selectedPart}
                isSelected
                onSelect={() => {}}
                onJoin={() => setMatchedWith(selectedPart)}
              />
            </section>
          </>
        )}
      </main>

      {matchedWith && (
        <MatchedModal
          participation={matchedWith}
          onClose={() => setMatchedWith(null)}
        />
      )}
    </div>
  );
}

// ─────────────────── 헤더 ───────────────────

function Header() {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3">
      <div className="w-9" aria-hidden />
      <h1 className="flex-1 truncate text-center text-[16px] font-bold text-zinc-900">
        띵동 공구
      </h1>
      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
        프로토타입 v2
      </span>
    </header>
  );
}

// ─────────────────── 카테고리 칩 ───────────────────

function FilterChips({
  active,
  onChange,
}: {
  active: Filter;
  onChange: (next: Filter) => void;
}) {
  const chips: Array<{ id: Filter; label: string; emoji?: string }> = [
    { id: "all", label: "전체" },
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, emoji: c.emoji })),
  ];
  return (
    <div className="sticky top-[52px] z-[5] bg-white">
      <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((c) => {
          const on = active === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onChange(c.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition active:scale-95",
                on
                  ? "border-brand bg-brand text-white"
                  : "border-zinc-200 bg-white text-zinc-700",
              )}
            >
              {c.emoji ? `${c.emoji} ` : ""}
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────── AI 추천 섹션 ───────────────────

function AIPicksSection({
  picks,
  showPagination,
}: {
  picks: AIPick[];
  showPagination: boolean;
}) {
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 카테고리 바뀌어서 picks가 줄면 페이지가 범위를 벗어날 수 있으니 클램프
  const totalPages = Math.max(1, Math.ceil(picks.length / PICKS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PICKS_PER_PAGE;
  const visible = picks.slice(start, start + PICKS_PER_PAGE);

  if (picks.length === 0) return null;

  return (
    <section className="bg-white px-4 pb-3 pt-2">
      <div className="mb-2 flex justify-end">
        <span className="text-[11px] text-zinc-400">{picks.length}건</span>
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((pick) => (
          <AIPickCard
            key={pick.id}
            pick={pick}
            expanded={expandedId === pick.id}
            onToggle={() =>
              setExpandedId((cur) => (cur === pick.id ? null : pick.id))
            }
          />
        ))}
      </div>

      {showPagination && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            aria-label="이전 추천"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 disabled:opacity-30"
          >
            ‹
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === safePage ? "w-4 bg-brand" : "w-1.5 bg-zinc-300",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            aria-label="다음 추천"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      )}
    </section>
  );
}

function AIPickCard({
  pick,
  expanded,
  onToggle,
}: {
  pick: AIPick;
  expanded: boolean;
  onToggle: () => void;
}) {
  const product = PRODUCTS.find((p) => p.id === pick.productId);
  if (!product) return null;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-gradient-to-r from-violet-50/60 to-white transition",
        expanded ? "border-violet-400 shadow-sm" : "border-violet-200",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-3 text-left transition active:scale-[0.99]"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-[28px]">
          {product.thumbnail}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {product.brand && (
              <span className="text-[10px] font-medium text-zinc-400">
                {product.brand}
              </span>
            )}
            <span className="rounded-sm bg-violet-100 px-1 py-px text-[9px] font-bold text-violet-700">
              ✨ AI 추천
            </span>
          </div>
          <p className="line-clamp-1 text-[13px] font-bold text-zinc-900">
            {product.name}
          </p>
          <p className="line-clamp-1 text-[11px] text-violet-600">
            {pick.reason}
            {pick.signal ? ` · ${pick.signal}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[13px] font-bold text-brand">
            {product.pricePerPerson.toLocaleString()}원
          </span>
          <span className="text-[10px] text-zinc-400">
            1인 / {product.groupSize}인 그룹
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-violet-200 bg-white/70 px-3 pb-3 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <AIPickAction
              variant="primary"
              label="호스팅하기"
              desc="호스트로서 상품을 주문하고, 내가 원하는 장소를 설정해 반띵해요."
              onClick={() =>
                alert(`(목업) "${product.name}" 호스팅 시작 단계로 이동`)
              }
            />
            <AIPickAction
              variant="outline"
              label="매칭받기"
              desc="주문은 호스트에게 맡기고, 반띵 장소에서 물건만 나눠요."
              onClick={() =>
                alert(`(목업) "${product.name}" 매칭 신청 단계로 이동`)
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AIPickAction({
  variant,
  label,
  desc,
  onClick,
}: {
  variant: "primary" | "outline";
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "h-10 rounded-lg text-[13px] font-bold transition active:scale-[0.98]",
          variant === "primary"
            ? "bg-brand text-white active:opacity-90"
            : "border border-brand bg-white text-brand active:bg-brand/5",
        )}
      >
        {label}
      </button>
      <p className="mt-1.5 text-[10.5px] leading-snug text-zinc-500">{desc}</p>
    </div>
  );
}

// ─────────────────── 참여건 카드 ───────────────────

function ParticipationRow({
  part,
  isSelected,
  onSelect,
  onJoin,
}: {
  part: Participation;
  isSelected: boolean;
  onSelect: () => void;
  onJoin: () => void;
}) {
  const product = PRODUCTS.find((p) => p.id === part.productId);
  if (!product) return null;

  return (
    <div
      onMouseEnter={onSelect}
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-xl border bg-white p-3 transition",
        isSelected ? "border-brand bg-brand/[0.04]" : "border-zinc-200",
      )}
    >
      {/* 상단: 상품 정보 */}
      <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[20px]">
          {product.thumbnail}
        </span>
        <div className="min-w-0 flex-1">
          {product.brand && (
            <p className="text-[9px] font-medium text-zinc-400">
              {product.brand}
            </p>
          )}
          <p className="line-clamp-1 text-[12px] font-bold text-zinc-900">
            {product.name}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-brand">
          1인 {product.pricePerPerson.toLocaleString()}원
        </span>
      </div>

      {/* 하단: 참여자 정보 */}
      <div className="flex items-start gap-3 pt-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[15px] font-bold text-brand">
          {part.nickname.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-bold text-zinc-900">
              {part.nickname}
            </p>
            <span className="text-[10px] text-zinc-400">
              · {part.joinedAtRel}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">
            📍 {part.pickupName}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">
            🕒 {part.timeWindow}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-400">
            {trustLabel(part.trustLevel)}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onJoin();
          }}
          className="h-9 shrink-0 self-center rounded-full bg-brand px-4 text-[12px] font-bold text-white active:opacity-80"
        >
          함께하기
        </button>
      </div>
    </div>
  );
}

// ─────────────────── 매칭 성사 모달 ───────────────────

function MatchedModal({
  participation,
  onClose,
}: {
  participation: Participation;
  onClose: () => void;
}) {
  const product = PRODUCTS.find((p) => p.id === participation.productId);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl"
      >
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-[28px]">
            🤝
          </div>
          <h3 className="text-[18px] font-bold text-zinc-900">
            {participation.nickname}님과 매칭됐어요!
          </h3>
          <p className="mt-1 text-[13px] text-zinc-500">
            채팅방이 자동으로 열리고, 거래 진행 단계로 이동합니다.
          </p>
        </div>

        <div className="mt-4 space-y-1.5 rounded-xl bg-zinc-50 px-3 py-3 text-[12px]">
          {product && <Row k="🛒 상품" v={product.name} />}
          <Row k="📍 픽업 장소" v={participation.pickupName} />
          <Row k="🕒 희망 시간" v={participation.timeWindow} />
          <Row k="🤝 상대 신뢰도" v={trustLabel(participation.trustLevel)} />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="h-12 flex-1 rounded-xl bg-zinc-100 text-[14px] font-semibold text-zinc-700"
          >
            닫기
          </button>
          <button
            onClick={() => alert("(목업) 채팅방으로 이동")}
            className="h-12 flex-1 rounded-xl bg-brand text-[14px] font-bold text-white active:opacity-80"
          >
            채팅 시작
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{k}</span>
      <span className="font-medium text-zinc-900">{v}</span>
    </div>
  );
}
