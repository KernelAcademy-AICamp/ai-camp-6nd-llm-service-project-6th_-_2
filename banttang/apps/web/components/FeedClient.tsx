"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HomeHeroBanners } from "./HomeHeroBanners";
import { HotDealChips } from "./HotDealChips";
import { GroceryPicksSection } from "./GroceryPicksSection";
import { PICK_GROUPS, type PickGroup, type PickRoom } from "@/lib/grocery-picks";
import { GROUP_BUYS, minGroupPrice } from "@/lib/groupbuy";
import { KakaoMapView, type MapPin } from "./KakaoMapView";
import type { DisplayStatus, PartyRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { padPickRooms } from "@/lib/demo-data";

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

  // 가게명/대표 메뉴 검색 — 클라이언트 필터.
  // 탭 구분 없이 장보기·배달을 통합 노출. 검색어가 있으면 가게명/메뉴로 필터링.
  const [query, setQuery] = useState(initialQuery);
  // 우리동네 반띵 보기 섹션 전용 검색어 — 짭과 동일 컨벤션. 상단 검색과 별개.
  const [sectionQuery, setSectionQuery] = useState("");
  // 카테고리 칩 — 지도/리스트 어느 view에서도 보이도록 FeedClient 레벨에서 보관.
  const [catFilter, setCatFilter] = useState<MapCatFilter>("all");

  const visibleParties = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sq = sectionQuery.trim().toLowerCase();
    let list = parties;
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
    // 카테고리 칩 필터 — 지도/리스트 양쪽 동일 적용. "hotdeal"은 별도 처리(파티 X, GROUP_BUYS만).
    if (catFilter === "hotdeal") return [];
    if (catFilter === "etc") {
      list = list.filter((p) => !p.pick_group);
    } else if (catFilter !== "all") {
      list = list.filter((p) => p.pick_group === catFilter);
    }
    return list;
  }, [parties, query, sectionQuery, catFilter]);

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
      {/* 홈 프로모션 배너(3종) + 통합 검색창 */}
      <HomeHeroBanners
        query={query}
        onClear={() => {
          setQuery("");
          router.replace("/feed");
        }}
      />

      {/* 바로 반띵하기 (AI 추천) — 짭과 동일하게 지도/리스트 위에 노출.
          검색 중에는 컨텍스트가 다르므로 숨김. 두 보기 모두에서 보임. */}
      {!query && <GroceryPicksSection rooms={displayPickRooms} />}

      {/* 섹션 헤더 — 건수는 별도로 노출하지 않음. 토글은 카테고리 칩 아래로 이동. */}
      <div>
        <h2 className="text-[19px] font-extrabold tracking-tight text-zinc-900">
          우리동네 반띵 보기
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500">
          내 근처 반띵 주문이에요. 지도에 표시된 위치에서 만나서 거래해요.
        </p>
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

      {/* 카테고리 칩 + 토글 + 주문 영역을 가로 풀폭 흰 바탕으로 묶음 */}
      <div className="-mx-4 flex flex-col gap-3 bg-white px-4 py-3">
        {/* 카테고리 칩 — 지도/리스트 어느 view에서도 항상 노출. 핫딜은 빨간 톤 */}
        <CategoryChipRow
          active={catFilter}
          onChange={(next) => setCatFilter(next)}
        />

        {/* 보기 모드 토글 — 카테고리 칩 아래로 이동 */}
        <div className="flex items-center justify-end">
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

        {view === "map" ? (
          <MapView
            parties={visibleParties}
            catFilter={catFilter}
            onPickCategory={setCatFilter}
          />
        ) : catFilter === "hotdeal" ? (
          // 리스트 모드 + 핫딜 칩 → GROUP_BUYS를 카드 형태로 노출
          <div className="flex flex-col gap-2">
            {GROUP_BUYS.map((gb) => (
              <Link
                key={gb.slug}
                href={`/groupbuy/${gb.slug}` as any}
                className="flex items-center gap-3 rounded-xl border border-rose-200 bg-white p-3 text-left active:bg-rose-50"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-[28px]">
                  {gb.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-rose-500 px-1.5 py-px text-[10px] font-bold text-white">
                      {gb.dealType}
                    </span>
                    <span className="line-clamp-1 text-[13px] font-bold text-zinc-900">
                      {gb.title}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">
                    📍 {gb.pickupName}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                    <span className="font-bold text-rose-500">
                      최저 {minGroupPrice(gb).toLocaleString()}원~
                    </span>
                    <span className="text-zinc-400">·</span>
                    <span className="font-semibold text-zinc-600">
                      {gb.currentCount}/{gb.targetCount}명
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
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
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400">
            <p>&ldquo;{query}&rdquo; 검색 결과가 없어요.</p>
          </div>
        ) : null}
      </div>

      {/* 동네 핫딜 칩 — 사장님 공구·핫딜. 우리동네 반띵 보기 섹션 아래. 검색 중엔 숨김. */}
      {!query && <HotDealChips />}

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
    {/* 주문 등록 플로팅 버튼 — 지도/리스트 모두에서 우하단(BottomNav 위)에 노출. */}
    <Link
      href="/host/new"
      aria-label="반띵 등록하기"
      className="fixed bottom-20 right-[max(1rem,calc(50%-13rem))] z-40 inline-flex items-center gap-1 rounded-full bg-brand pl-3 pr-4 py-3 text-[13px] font-bold text-white shadow-lg shadow-emerald-500/30 transition-transform active:scale-95"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      반띵 등록하기
    </Link>
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

// 지도 섹션 카테고리 필터 — 상단 AI 칩과 동일 분류(PICK_GROUPS) + "기타" + "핫딜"(동네 핫딜).
type MapCatFilter = "all" | PickGroup | "etc" | "hotdeal";

// 동네 핫딜(GROUP_BUYS) → 핫딜 variant 핀으로 변환. id는 "hotdeal-{slug}".
function buildHotdealPins(): MapPin[] {
  return GROUP_BUYS.map((gb) => ({
    id: `hotdeal-${gb.slug}`,
    lat: gb.lat,
    lng: gb.lng,
    emoji: gb.emoji,
    categoryLabel: gb.dealType, // "공구" | "핫딜"
    productName: gb.title,
    timeText: `${gb.currentCount}/${gb.targetCount}명 · 최저 ${minGroupPrice(gb).toLocaleString()}원`,
    variant: "hotdeal",
  }));
}

function MapView({
  parties,
  catFilter,
  onPickCategory,
}: {
  parties: Party[];
  catFilter: MapCatFilter;
  onPickCategory: (next: MapCatFilter) => void;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 내 위치 — 파란 점 표시 및 panTo 트리거. ts는 같은 좌표도 다시 panTo되도록 매번 새로.
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [recenter, setRecenter] = useState<
    { lat: number; lng: number; ts: number } | null
  >(null);
  const [locating, setLocating] = useState(false);
  // 카테고리 칩 바뀌면 선택 핀 초기화 — 핀이 사라져서 카드가 떠있는 상태 방지.
  useEffect(() => {
    setSelectedId(null);
  }, [catFilter]);

  // 위치 핀 옵션 시트 — 현재 위치 자동 사용 / 거주지 직접 변경 둘 중 택일.
  const [showLocSheet, setShowLocSheet] = useState(false);

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

  // 파티 핀 — parties는 이미 FeedClient에서 catFilter로 필터됨.
  const withCoords = parties.filter(
    (p) => typeof p.lat === "number" && typeof p.lng === "number",
  );

  const partyPins: MapPin[] = withCoords.map((p) => {
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
  const missing = parties.length - partyPins.length;

  // 동네 핫딜 핀 — "all"이나 "hotdeal" 칩에서만 노출. (특정 카테고리 필터엔 숨김)
  const hotdealPins: MapPin[] =
    catFilter === "all" || catFilter === "hotdeal" ? buildHotdealPins() : [];

  const pins: MapPin[] = [...partyPins, ...hotdealPins];

  // 데이터 바뀌어서 선택된 핀이 사라지면 선택 해제
  const selectedParty =
    selectedId ? withCoords.find((p) => p.id === selectedId) ?? null : null;

  // 핀 클릭 라우팅 — 핫딜 핀은 /groupbuy/[slug]로 바로 이동, 일반 핀은 카드 선택만.
  function handlePinClick(id: string) {
    if (id.startsWith("hotdeal-")) {
      const slug = id.replace(/^hotdeal-/, "");
      router.push(`/groupbuy/${slug}` as any);
      return;
    }
    setSelectedId(id);
  }

  // onPickCategory prop은 MapView 내부에서 직접 칩 렌더를 안 하므로 사용하지 않음.
  // FeedClient 레벨에서 chip을 그리고 catFilter만 props로 받는 패턴으로 단일화.
  void onPickCategory;

  return (
    <div className="space-y-3">
      {/* 지도 + 우하단 "내 위치" 버튼. "내 주문 등록하기" 는 우하단 글로벌 플로팅 버튼으로 분리. */}
      <div className="relative">
        <KakaoMapView
          pins={pins}
          selectedId={selectedId}
          onPinClick={handlePinClick}
          recenterTo={recenter}
          userLocation={myLoc}
        />
        <button
          type="button"
          onClick={() => setShowLocSheet(true)}
          disabled={locating}
          aria-label="위치 옵션"
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

      {/* 위치 옵션 시트 — 위치 핀(◎) 탭 시 노출. 두 액션: 현재 위치 사용 / 거주지 직접 변경. */}
      {showLocSheet && (
        <div
          onClick={() => setShowLocSheet(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl"
          >
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-[24px]">
                📍
              </div>
              <h3 className="text-[16px] font-bold text-zinc-900">
                내 위치를 어떻게 정할까요?
              </h3>
              <p className="mt-1 text-[12px] text-zinc-500">
                현재 위치를 자동으로 잡거나 거주지를 직접 다시 선택할 수 있어요.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowLocSheet(false);
                  locateMe();
                }}
                className="h-12 w-full rounded-xl bg-brand text-[14px] font-bold text-white active:opacity-90"
              >
                현재 위치 자동으로 사용
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLocSheet(false);
                  router.push("/onboarding/address" as any);
                }}
                className="h-12 w-full rounded-xl border border-brand bg-white text-[14px] font-bold text-brand-dark active:bg-brand/5"
              >
                내 거주지 직접 설정하기
              </button>
              <button
                type="button"
                onClick={() => setShowLocSheet(false)}
                className="mt-1 h-10 w-full text-[13px] font-semibold text-zinc-500 active:text-zinc-700"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

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
              {party.host_nickname || "파티장"}
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

// ─────────────────────────────────────────────────────
// CategoryChipRow — 우리동네 반띵 보기 카테고리 칩. 지도/리스트 모두에서 노출.
// 분류: 전체 / 건강식품 / 과일·계란 / 1인 홈케어 / 기타 / 핫딜(빨강).
// ─────────────────────────────────────────────────────
function CategoryChipRow({
  active,
  onChange,
}: {
  active: MapCatFilter;
  onChange: (next: MapCatFilter) => void;
}) {
  const chips = [
    { id: "all" as MapCatFilter, label: "전체" },
    ...PICK_GROUPS.map((g) => ({
      id: g.key as MapCatFilter,
      label: g.label,
      emoji: g.emoji,
    })),
    { id: "etc" as MapCatFilter, label: "기타", emoji: "🧺" },
    { id: "hotdeal" as MapCatFilter, label: "동네 핫딜", emoji: "🔥" },
  ] as Array<{ id: MapCatFilter; label: string; emoji?: string }>;
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden">
      {chips.map((c) => {
        const on = active === c.id;
        const isHotdeal = c.id === "hotdeal";
        // 비-핫딜: 활성=검정 굵게+밑줄 / 비활성=회색. 핫딜만 빨강 강조 유지.
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={cn(
              "shrink-0 px-1 py-1.5 text-[13px] transition",
              isHotdeal
                ? on
                  ? "font-extrabold text-rose-600 underline underline-offset-[6px] decoration-2"
                  : "font-semibold text-rose-500 active:text-rose-600"
                : on
                  ? "font-extrabold text-brand underline underline-offset-[6px] decoration-2 decoration-brand"
                  : "font-semibold text-zinc-900 active:text-zinc-600",
            )}
          >
            {c.emoji ? `${c.emoji} ` : ""}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
