"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FeedPromoBanner } from "./FeedPromoBanner";
import { HotDealChips } from "./HotDealChips";
import { GroceryPicksSection } from "./GroceryPicksSection";
import { PICK_GROUPS, type PickGroup, type PickRoom } from "@/lib/grocery-picks";
import { KakaoMapView, type MapPin } from "./KakaoMapView";
import type { DisplayStatus, PartyRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildDemoFeedParties, padPickRooms } from "@/lib/demo-data";

type Party = PartyRow & {
  occupied_count: number;
  display_status: DisplayStatus;
  pickup_name: string | null;
  lat: number | null;
  lng: number | null;
  /** 짭 카테고리 — 데모 카드에 부착되는 분류. 없으면 지도 칩에서 "기타". */
  pick_group?: PickGroup | null;
  /** 반띵 희망 시간대 (자유 텍스트). 없으면 deal_at에서 파생. */
  time_window?: string | null;
};

type Sort = "deadline" | "latest";
type View = "list" | "map";

export function FeedClient({
  parties,
  sort,
  view,
  initialQuery = "",
  pickRooms = [],
  userLat = null,
  userLng = null,
}: {
  parties: Party[];
  sort: Sort;
  view: View;
  /** /feed?q=xxx 로 들어왔을 때 사용. /feed/search에서 검색 후 리다이렉트 받음. */
  initialQuery?: string;
  /** 추천 섹션 — 시스템 호스트가 만든 모집중(0/2) 방. 검색 시엔 숨김. */
  pickRooms?: PickRoom[];
  /** 사용자 위치(거주지 좌표) — 거리 필터 기준점. 없으면 거리 필터 비활성. */
  userLat?: number | null;
  userLng?: number | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // 데모 좌표 기준점만 보존 — 거리 필터는 짭 정렬 따라 제거됨.
  const baseLoc =
    userLat !== null && userLng !== null
      ? { lat: userLat, lng: userLng }
      : null;

  // 가게명/대표 메뉴 검색 — 클라이언트 필터.
  // 탭 구분 없이 장보기·배달을 통합 노출. 검색어가 있으면 가게명/메뉴로 필터링.
  const [query, setQuery] = useState(initialQuery);
  // 우리동네 반띵 보기 섹션 전용 검색어 — 짭과 동일 컨벤션. 상단 검색과 별개.
  const [sectionQuery, setSectionQuery] = useState("");

  // 실제 모집중 주문이 없을 때 보이는 데모 카드. 위치 기준 ±1km 안에 흩어둠.
  // 실제 데이터가 1건이라도 들어오면 데모는 사라진다.
  const demoParties = useMemo(
    () =>
      parties.length === 0
        ? buildDemoFeedParties(baseLoc?.lat ?? userLat, baseLoc?.lng ?? userLng)
        : [],
    [parties.length, baseLoc?.lat, baseLoc?.lng, userLat, userLng],
  );
  const baseParties = parties.length > 0 ? parties : demoParties;

  const visibleParties = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sq = sectionQuery.trim().toLowerCase();
    let list = baseParties;
    if (q) {
      list = list.filter((p) => {
        const name = p.store_name?.toLowerCase() ?? "";
        const menu = p.representative_menu?.toLowerCase() ?? "";
        return name.includes(q) || menu.includes(q);
      });
    }
    if (sq) {
      list = list.filter((p) => {
        const name = p.store_name?.toLowerCase() ?? "";
        const menu = p.representative_menu?.toLowerCase() ?? "";
        const pickup =
          (p.pickup_name ?? p.custom_pickup_name ?? "").toLowerCase();
        return name.includes(sq) || menu.includes(sq) || pickup.includes(sq);
      });
    }
    return list;
  }, [baseParties, query, sectionQuery]);

  // AI 추천 — 그룹당 최대 4건이 되도록 데모로 패딩 (실제가 0건이면 12건 다 데모).
  const displayPickRooms = useMemo(() => padPickRooms(pickRooms, 4), [pickRooms]);

  // 피드 실시간 — 누가 어디든 신청/승인/취소되거나 상태(recruiting↔closed)가 바뀌면
  // 카드의 점유 카운트/상태가 즉시 갱신되도록 SSR 재요청.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
      if (cancelled) return;
      channel = supabase
        .channel("feed-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "party_participants" },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "parties" },
          () => router.refresh(),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  function go(next: { sort?: string; view?: string }) {
    const p = new URLSearchParams();
    p.set("sort", next.sort ?? sort);
    p.set("view", next.view ?? view);
    // scroll: false — 토글로 보기 모드만 바꿀 땐 현재 스크롤 위치 유지.
    router.replace(`/feed?${p.toString()}`, { scroll: false });
  }

  return (
    <>
    <div className="flex flex-col gap-3 p-4">
      {/* 프로모션 배너 — 검색창 위 */}
      <FeedPromoBanner />

      {/* 통합 검색 — 탭 위. 인풋 외형이지만 클릭 시 검색 화면(/feed/search)으로 이동. */}
      <div className="relative">
        <Link
          href={"/feed/search" as any}
          className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-9 text-[13px] active:bg-zinc-50"
        >
          <span className={query ? "truncate text-zinc-800" : "text-zinc-400"}>
            {query || "배달·장보기 통합 검색 (가게명 또는 메뉴)"}
          </span>
        </Link>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              router.replace("/feed");
            }}
            aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 active:bg-zinc-200"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* 동네 핫딜 칩 — 사장님 공구·핫딜. 검색 중엔 숨김. */}
      {!query && <HotDealChips />}

      {/* 바로 반띵하기 (AI 추천) — 짭과 동일하게 지도/리스트 위에 노출.
          검색 중에는 컨텍스트가 다르므로 숨김. 두 보기 모두에서 보임. */}
      {!query && <GroceryPicksSection rooms={displayPickRooms} />}

      {/* 섹션 헤더 + 토글 — 한 컨테이너에 묶어 보조 문구와 토글 사이 간격을 직접 제어. */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[19px] font-extrabold tracking-tight text-zinc-900">
            우리동네 반띵 보기
          </h2>
          <span className="shrink-0 text-[12px] font-medium text-zinc-400">
            {visibleParties.length}건
          </span>
        </div>
        <p className="mt-1 text-[13px] text-zinc-500">
          내 근처 반띵 주문이에요. 지도에 표시된 위치에서 만나서 거래해요.
        </p>
        <div className="mt-1.5 flex items-center justify-end">
          <div className="flex shrink-0 gap-1 rounded-full border border-zinc-200 bg-white p-0.5 text-xs">
            {[
              { v: "map", label: "지도" },
              { v: "list", label: "리스트" },
            ].map((m) => (
              <button
                key={m.v}
                onClick={() => go({ view: m.v })}
                className={cn(
                  "rounded-full px-3 py-1",
                  view === m.v ? "bg-brand text-white" : "text-zinc-500",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 섹션 검색창 — 짭과 동일 컨벤션. 상품명/메뉴/픽업 위치 통합 검색. */}
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-zinc-400"
          aria-hidden
        >
          🔍
        </span>
        <input
          type="text"
          value={sectionQuery}
          onChange={(e) => setSectionQuery(e.target.value)}
          placeholder="반띵하고 싶은 상품명을 검색해 보세요. 예) 커피, 생수, 해외 직구"
          className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-9 text-[13px] placeholder:text-zinc-400 focus:border-brand focus:bg-white focus:outline-none"
        />
        {sectionQuery && (
          <button
            type="button"
            onClick={() => setSectionQuery("")}
            aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600"
          >
            ×
          </button>
        )}
      </div>

      {view === "map" ? (
        <MapView parties={visibleParties} />
      ) : visibleParties.length > 0 ? (
        <div className="flex flex-col gap-2">
          {visibleParties.map((p) => (
            <FeedOrderRow
              key={p.id}
              party={p}
              onOpen={() =>
                router.push(
                  (p.id.startsWith("demo-") ? "#" : `/feed/${p.id}`) as any,
                )
              }
            />
          ))}
        </div>
      ) : query ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-400">
          <p>&ldquo;{query}&rdquo; 검색 결과가 없어요.</p>
        </div>
      ) : null}

      {/* 직접 만들기 CTA (맨 아래) — 문구 + 작은 버튼 */}
      {view === "list" && (
        <div className="mt-1 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-7 text-center">
          <p className="text-[13px] text-zinc-400">찾으시는 상품이 없나요?</p>
          <p className="text-[13px] text-zinc-400">내가 먼저 만들어 볼까요</p>
          <Link
            href="/host/new"
            className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand px-5 py-2 text-[13px] font-bold text-white transition active:scale-95"
          >
            반띵 만들기
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      )}
    </div>
    {/* 주문 등록 플로팅 버튼 — 주문별(리스트) 보기에서만 노출.
        지도 보기는 지도 우상단 자체 버튼을 사용하므로 FAB는 숨겨 중복 제거. */}
    {view === "list" && (
      <Link
        href="/host/new"
        aria-label="주문 등록"
        className="fixed bottom-20 right-[max(1rem,calc(50%-13rem))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-emerald-500/30 transition-transform active:scale-95"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </Link>
    )}
    </>
  );
}

// 핀/카드에 노출되는 카테고리 분류는 PartyCategory(배달/장보기/온라인)가 아니라
// 짭(PICK_GROUPS) 분류(건강식품/과일·계란/홈케어)로 통일. pick_group 없으면 "기타".
function pickGroupBadge(group?: PickGroup | null): {
  emoji: string;
  label: string;
} {
  if (!group) return { emoji: "🧺", label: "기타" };
  const g = PICK_GROUPS.find((x) => x.key === group);
  return g ? { emoji: g.emoji, label: g.label } : { emoji: "🧺", label: "기타" };
}

// 반띵 희망 시간대 라벨 — 짭(prototype/v2)에서 쓰던 자유 텍스트 컨벤션과 동일 형식.
// 우선순위: 사용자가 직접 박은 time_window > deal_at에서 파생.
// 파생 형식: "[평일/주말] [오전/점심/오후/저녁/밤] [N시]" (짭 라벨 컨벤션과 동일 어휘).
function timeWindowText(party: {
  time_window?: string | null;
  deal_at: string;
}): string {
  if (party.time_window) return party.time_window;
  const t = new Date(party.deal_at).getTime();
  if (Number.isNaN(t)) return "";
  const kst = new Date(t + 9 * 60 * 60 * 1000);
  const wd = kst.getUTCDay(); // 0=일, 6=토
  const h = kst.getUTCHours();
  const dayClass = wd === 0 || wd === 6 ? "주말" : "평일";
  const timeClass =
    h < 6 ? "새벽" : h < 11 ? "오전" : h < 13 ? "점심" : h < 17 ? "오후" : h < 21 ? "저녁" : "밤";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dayClass} ${timeClass} ${h12}시`;
}

// 지도 섹션 카테고리 필터 — 상단 AI 칩과 동일 분류(PICK_GROUPS) + "기타".
// 데모 카드에는 pick_group이 박혀 있고, 실제 파티는 분류 없음 → "기타"로 들어감.
type MapCatFilter = "all" | PickGroup | "etc";

function MapView({ parties }: { parties: Party[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<MapCatFilter>("all");
  // 내 위치 — 파란 점 표시 및 panTo 트리거. ts는 같은 좌표도 다시 panTo되도록 매번 새로.
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [recenter, setRecenter] = useState<
    { lat: number; lng: number; ts: number } | null
  >(null);
  const [locating, setLocating] = useState(false);

  function locateMe() {
    if (locating) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      alert("이 브라우저에서는 위치 정보를 사용할 수 없어요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setMyLoc(next);
        setRecenter({ ...next, ts: Date.now() });
        setLocating(false);
      },
      () => {
        setLocating(false);
        alert("현재 위치를 가져오지 못했어요. 위치 권한을 확인해 주세요.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }

  const byCategory =
    catFilter === "all"
      ? parties
      : catFilter === "etc"
        ? parties.filter((p) => !p.pick_group)
        : parties.filter((p) => p.pick_group === catFilter);

  const withCoords = byCategory.filter(
    (p) => typeof p.lat === "number" && typeof p.lng === "number",
  );

  const pins: MapPin[] = withCoords.map((p) => {
    const cat = pickGroupBadge(p.pick_group);
    return {
      id: p.id,
      lat: p.lat as number,
      lng: p.lng as number,
      emoji: cat.emoji,
      categoryLabel: cat.label,
      productName: p.store_name,
      timeText: timeWindowText(p),
    };
  });
  const missing = byCategory.length - pins.length;

  // 데이터 바뀌어서 선택된 핀이 사라지면 선택 해제
  const selectedParty =
    selectedId ? withCoords.find((p) => p.id === selectedId) ?? null : null;

  // 카테고리 바뀌면 핀 선택 초기화
  function handleCat(next: MapCatFilter) {
    setCatFilter(next);
    setSelectedId(null);
  }

  return (
    <div className="space-y-3">
      {/* 지도 섹션 카테고리 칩 — 상단 AI 칩(PICK_GROUPS)과 동일 분류 + 기타 */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden">
        {(
          [
            { id: "all" as MapCatFilter, label: "전체" },
            ...PICK_GROUPS.map((g) => ({
              id: g.key as MapCatFilter,
              label: g.label,
              emoji: g.emoji,
            })),
            { id: "etc" as MapCatFilter, label: "기타", emoji: "🧺" },
          ] as Array<{ id: MapCatFilter; label: string; emoji?: string }>
        ).map((c) => {
          const on = catFilter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => handleCat(c.id)}
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

      {/* 지도 + 우상단 "내 주문 등록하기" + 우하단 "내 위치" 버튼 */}
      <div className="relative">
        <KakaoMapView
          pins={pins}
          selectedId={selectedId}
          onPinClick={setSelectedId}
          recenterTo={recenter}
          userLocation={myLoc}
        />
        <Link
          href="/host/new"
          className="absolute right-3 top-3 z-[1] rounded-full border border-brand bg-white px-3 py-1.5 text-[11px] font-bold text-brand shadow-sm active:bg-brand/5"
        >
          + 내 주문 등록하기
        </Link>
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          aria-label="내 위치로 이동"
          className="absolute bottom-3 right-3 z-[1] flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition active:scale-95 disabled:opacity-50"
        >
          {locating ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="animate-spin">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {missing > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          {missing}건은 좌표 정보가 없어 지도에 표시되지 않았어요.
        </p>
      )}
      {selectedParty ? (
        <FeedOrderRow
          party={selectedParty}
          highlighted
          onOpen={() =>
            router.push(
              (selectedParty.id.startsWith("demo-")
                ? "#"
                : `/feed/${selectedParty.id}`) as any,
            )
          }
        />
      ) : pins.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 text-center">
          <span className="text-[24px]">📍</span>
          <p className="text-[12px] font-bold text-zinc-700">
            이 카테고리엔 아직 등록된 반띵이 없어요
          </p>
          <p className="text-[11px] text-zinc-500">
            첫 번째로 위치를 등록하면 다른 사람이 찾아올 거예요.
          </p>
        </div>
      ) : (
        <p className="px-1 text-[11px] text-zinc-400">
          지도 핀을 탭하면 상세 카드가 아래에 열려요.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// FeedOrderRow — 짭(/prototype/v2)의 ParticipationRow와 동일 레이아웃.
// 상단: 카테고리 칩 + 상품명 + 1인 가격 | 하단: 호스트(닉네임/시간/픽업/신뢰) + "함께하기"
// ─────────────────────────────────────────────

function trustLabelFromLevel(
  level: PartyRow["host_level"],
  tx: number,
): string {
  if (level === "king") return "⭐⭐⭐ 든든";
  if (level === "tree") return "⭐⭐ 신뢰";
  return `⭐ 새내기${tx > 0 ? ` · 거래 ${tx}회` : ""}`;
}

function relativeFromIso(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

function FeedOrderRow({
  party,
  highlighted = false,
  onOpen,
}: {
  party: Party;
  highlighted?: boolean;
  onOpen?: () => void;
}) {
  const cat = pickGroupBadge(party.pick_group);
  const slots = `${party.occupied_count}/${party.max_participants}명`;
  return (
    <div
      onClick={onOpen}
      className={cn(
        "cursor-pointer rounded-xl border bg-white p-3 transition",
        highlighted ? "border-brand bg-brand/[0.04]" : "border-zinc-200",
      )}
    >
      {/* 상단: 카테고리 칩 + 상품명 + 1인 가격 */}
      <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[20px]">
          {cat.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-medium text-zinc-400">{cat.label}</p>
          <p className="line-clamp-1 text-[12px] font-bold text-zinc-900">
            {party.store_name}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-brand">
          1인 {party.price_per_person.toLocaleString()}원
        </span>
      </div>

      {/* 하단: 호스트 정보 + "함께하기" */}
      <div className="flex items-start gap-3 pt-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[15px] font-bold text-brand">
          {(party.host_nickname || "?").slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-bold text-zinc-900">
              {party.host_nickname || "호스트"}
            </p>
            <span className="text-[10px] text-zinc-400">
              · {relativeFromIso(party.created_at)}
            </span>
            <span className="ml-auto text-[10px] font-semibold text-zinc-500">
              {slots}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">
            📍 {party.pickup_name || party.custom_pickup_name || "픽업 미정"}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">
            🕒 {timeWindowText(party)} 반띵 희망
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-400">
            {trustLabelFromLevel(party.host_level, party.host_transaction_count)}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.();
          }}
          className="h-9 shrink-0 self-center rounded-full bg-brand px-4 text-[12px] font-bold text-white active:opacity-80"
        >
          함께하기
        </button>
      </div>
    </div>
  );
}
