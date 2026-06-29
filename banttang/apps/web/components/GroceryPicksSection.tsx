"use client";

// 홈 "바로 반띵하기"(AI BETA) 섹션 — 시스템 호스트가 미리 만든 반띵 방 추천.
// 칩(전체/건강식품/과일·계란/1인 홈케어 공구)으로 필터. 카드 탭 시 펼쳐지며
//  - 파티장으로 참여하기 → host/new로 상품·장소 프리필(내가 호스트로 새 방 생성)
//  - 파티원으로 참여하기 → 해당 방에 참여(자동 승인) 후 상세로 이동

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PICK_GROUPS, type PickGroup, type PickRoom } from "@/lib/grocery-picks";
import { formatKRW } from "@/lib/party-status";
import { cn } from "@/lib/utils";

// 한 탭(그룹)에 노출할 방 개수
const PER_GROUP = 4;

// 그룹별 AI 추천 사유 문구 풀 (실제 분석 아님, 데모용 고정 텍스트)
const REASONS: Record<PickGroup, string[]> = {
  health: [
    "단백질 식단 선호 패턴 · 이번 주 12명 검색",
    "고단백 저칼로리 · 동네 인기 상승 ↑",
    "운동 식단 수요 · 주말 주문 많음",
  ],
  fruitegg: [
    "제철 과일 수요 급증 · 이번 주 9명 검색",
    "아침 대용 인기 · 동네 검색 상위",
    "신선식품 정기 수요 · 이웃 추천",
  ],
  homecare: [
    "1인 가구 추천 · 주말 수요 많음",
    "생필품 묶음 공구 · 이번 주 8명 검색",
    "정기 소모품 · 동네 인기 상승 ↑",
  ],
};

function hostNewHref(r: PickRoom): string {
  const params = new URLSearchParams({
    tab: "shopping",
    store: r.title,
    image: r.image,
    price: String(r.pricePerPerson),
  });
  return `/host/new?${params.toString()}`;
}

export function GroceryPicksSection({ rooms }: { rooms: PickRoom[] }) {
  const [group, setGroup] = useState<PickGroup | "all">("all");
  // "전체" 탭에서만 사용하는 페이지 (4건 단위)
  const [page, setPage] = useState(0);

  if (rooms.length === 0) return null;

  const byGroup = (key: PickGroup) =>
    rooms.filter((r) => r.group === key).slice(0, PER_GROUP);
  const rawAll =
    group === "all"
      ? PICK_GROUPS.flatMap((g) => byGroup(g.key))
      : byGroup(group);
  // 관리자 큐레이션(featured)을 항상 위로 — "전체" 탭에서 핫딜 카드가 먼저 보이도록.
  // 단일 카테고리 탭에서도 동일 정렬을 유지해 일관성 확보.
  const all = [...rawAll].sort(
    (a, b) => Number(!!b.featured) - Number(!!a.featured),
  );

  if (all.length === 0) return null;

  // 그룹 바꿔서 전체 항목이 줄면 페이지가 범위를 벗어날 수 있어 클램프
  const totalPages = Math.max(1, Math.ceil(all.length / PER_GROUP));
  const safePage = group === "all" ? Math.min(page, totalPages - 1) : 0;
  const start = safePage * PER_GROUP;
  const visible =
    group === "all" ? all.slice(start, start + PER_GROUP) : all;
  const showPager = group === "all" && totalPages > 1;

  return (
    <section className="-mx-4 border-t-8 border-zinc-100 px-4 pb-2 pt-5">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <h2 className="text-[19px] font-extrabold tracking-tight text-zinc-900">
          지금 반띵하기 좋은 추천상품
        </h2>
        <span className="rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white">
          AI BETA
        </span>
      </div>
      <p className="mt-1 text-[13px] text-zinc-500">
        참여만 하면 AI가 1km 이내 참여자와 반띵을 매칭해줘요.
      </p>

      {/* 칩 + 카드 목록을 가로 풀폭 흰 바탕으로 깔아 텍스트 칩 가독성 ↑.
          상위 section이 이미 -mx-4 px-4 로 풀폭 처리돼 있으므로 내부 패딩만 정리. */}
      <div className="mt-3 flex flex-col gap-3 bg-white -mx-4 px-4 py-3">
        {/* 칩 */}
        <div className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <Chip
            label="전체"
            active={group === "all"}
            onClick={() => {
              setGroup("all");
              setPage(0);
            }}
          />
          {PICK_GROUPS.map((g) => (
            <Chip
              key={g.key}
              label={`${g.emoji} ${g.label}`}
              active={group === g.key}
              onClick={() => {
                setGroup(g.key);
                setPage(0);
              }}
            />
          ))}
        </div>

        {/* 방 카드 목록 */}
        <div className="flex flex-col gap-2.5">
          {visible.map((r, i) => (
            <RoomCard
              key={r.id}
              room={r}
              reason={REASONS[r.group][i % REASONS[r.group].length]}
              hot={!!r.featured}
            />
          ))}
        </div>

        {/* 페이지네이션 — "전체" 탭에서만 노출. 4건씩 넘겨서 보기. */}
        {showPager && (
          <div className="flex items-center justify-center gap-3">
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
      </div>
    </section>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 px-2 py-1.5 text-[13px] transition",
        active
          ? "font-extrabold text-brand underline underline-offset-[6px] decoration-2 decoration-brand"
          : "font-semibold text-zinc-900 active:text-zinc-600",
      )}
    >
      {label}
    </button>
  );
}

function RoomCard({
  room,
  reason,
  hot,
}: {
  room: PickRoom;
  reason: string;
  hot: boolean;
}) {
  const router = useRouter();

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => router.push(`/picks/${room.id}` as any)}
        className="flex w-full items-start gap-3 p-4 text-left active:bg-zinc-50"
      >
        {/* 썸네일 */}
        <div
          className="h-14 w-14 shrink-0 rounded-xl bg-zinc-100 bg-cover bg-center"
          style={{ backgroundImage: `url("${room.image}")` }}
          aria-label={room.title}
        />
        <div className="min-w-0 flex-1">
          {/* 뱃지 */}
          <div className="mb-1 flex items-center gap-1">
            {hot && (
              <span className="rounded bg-rose-500 px-1.5 py-px text-[10px] font-bold text-white">
                핫딜
              </span>
            )}
            <span className="rounded bg-violet-100 px-1.5 py-px text-[10px] font-bold text-violet-600">
              AI 추천
            </span>
          </div>
          <h3 className="line-clamp-1 text-[15px] font-bold leading-snug text-zinc-900">
            {room.title}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-[12px] text-zinc-400">{reason}</p>
        </div>
        {/* 가격 */}
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-extrabold text-zinc-900">
            {formatKRW(room.pricePerPerson)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            1인 / {room.maxMembers}인 그룹
          </p>
        </div>
      </button>

      {/* 펼침 패널 제거 — 호스팅/매칭 선택은 /picks/[id] 상세 페이지로 분리. */}
    </div>
  );
}
