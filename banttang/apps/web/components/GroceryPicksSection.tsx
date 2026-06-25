"use client";

// 홈 "바로 반띵하기"(AI BETA) 섹션 — 시스템 호스트가 미리 만든 반띵 방 추천.
// 칩(전체/건강식품/과일·계란/1인 홈케어 공구)으로 필터. 카드 탭 시 펼쳐지며
//  - 호스트하기 → host/new로 상품·장소 프리필(내가 호스트로 새 방 생성)
//  - 매칭받기   → 해당 방에 참여(자동 승인) 후 상세로 이동

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PICK_GROUPS, type PickGroup, type PickRoom } from "@/lib/grocery-picks";
import { formatKRW } from "@/lib/party-status";
import { cn } from "@/lib/utils";

// 한 탭(그룹)에 노출할 방 개수
const PER_GROUP = 3;

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
  // 펼쳐진 카드 id (아코디언). 기본: 첫 카드 펼침.
  const [openId, setOpenId] = useState<string | null>(rooms[0]?.id ?? null);

  if (rooms.length === 0) return null;

  const byGroup = (key: PickGroup) =>
    rooms.filter((r) => r.group === key).slice(0, PER_GROUP);
  const visible =
    group === "all"
      ? PICK_GROUPS.flatMap((g) => byGroup(g.key))
      : byGroup(group);

  if (visible.length === 0) return null;

  return (
    <section className="-mx-4 border-t-8 border-zinc-100 px-4 pb-2 pt-5">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <h2 className="text-[19px] font-extrabold tracking-tight text-zinc-900">
          바로 반띵하기
        </h2>
        <span className="rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white">
          AI BETA
        </span>
      </div>
      <p className="mt-1 text-[13px] text-zinc-500">
        참여만 하면 AI가 1km 이내 참여자와 반띵을 매칭해줘요.
      </p>

      {/* 칩 + 건수 */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          <Chip label="전체" active={group === "all"} onClick={() => setGroup("all")} />
          {PICK_GROUPS.map((g) => (
            <Chip
              key={g.key}
              label={`${g.emoji} ${g.label}`}
              active={group === g.key}
              onClick={() => setGroup(g.key)}
            />
          ))}
        </div>
        <span className="shrink-0 text-[12px] font-medium text-zinc-400">
          {visible.length}건
        </span>
      </div>

      {/* 방 카드 목록 */}
      <div className="mt-2 flex flex-col gap-2.5">
        {visible.map((r, i) => (
          <RoomCard
            key={r.id}
            room={r}
            reason={REASONS[r.group][i % REASONS[r.group].length]}
            hot={i === 0}
            open={openId === r.id}
            onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
          />
        ))}
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
        "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition",
        active
          ? "bg-zinc-900 text-white"
          : "border border-zinc-200 bg-white text-zinc-500 active:bg-zinc-50",
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
  open,
  onToggle,
}: {
  room: PickRoom;
  reason: string;
  hot: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);

  async function matchMe(e: React.MouseEvent) {
    e.stopPropagation();
    if (joining) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/parties/${room.id}/join`, { method: "POST" });
      // 이미 참여했거나 성공이면 상세로 이동
      router.push(`/feed/${room.id}` as any);
    } catch {
      setJoining(false);
    }
  }

  function host(e: React.MouseEvent) {
    e.stopPropagation();
    router.push(hostNewHref(room) as any);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
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

      {/* 펼침: 두 역할 버튼 */}
      {open && (
        <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 p-3">
          <button
            type="button"
            onClick={host}
            className="rounded-xl bg-brand px-3 py-2.5 text-center active:scale-[0.98]"
          >
            <span className="block text-[13px] font-bold text-white">호스트하기</span>
            <span className="mt-0.5 block text-[11px] leading-tight text-white/85">
              상품을 주문하고 내가 원하는 장소로 반띵
            </span>
          </button>
          <button
            type="button"
            onClick={matchMe}
            disabled={joining}
            className="rounded-xl border border-brand bg-white px-3 py-2.5 text-center active:scale-[0.98] disabled:opacity-60"
          >
            <span className="block text-[13px] font-bold text-brand-dark">
              {joining ? "참여 중…" : "매칭받기"}
            </span>
            <span className="mt-0.5 block text-[11px] leading-tight text-zinc-500">
              주문은 호스트에게, 장소에서 받기만
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
