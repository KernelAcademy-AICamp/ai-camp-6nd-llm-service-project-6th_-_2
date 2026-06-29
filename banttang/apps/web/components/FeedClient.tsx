"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HomeHeroBanners } from "./HomeHeroBanners";
import { GroceryPicksSection } from "./GroceryPicksSection";
import { PICK_GROUPS, type PickGroup, type PickRoom } from "@/lib/grocery-picks";
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
  currentUserId = null,
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
  /** 현재 로그인 유저 id — 내가 만든 반띵엔 '함께하기' 버튼을 숨긴다. */
  currentUserId?: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // 가게명/대표 메뉴 검색 — 클라이언트 필터.
  // 탭 구분 없이 장보기·배달을 통합 노출. 검색어가 있으면 가게명/메뉴로 필터링.
  const [query, setQuery] = useState(initialQuery);
  // 카테고리 칩 — 지도/리스트 어느 view에서도 보이도록 FeedClient 레벨에서 보관.
  const [catFilter, setCatFilter] = useState<MapCatFilter>("all");

  const visibleParties = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = parties;
    if (q) {
      list = list.filter((p) => {
        const name = p.store_name?.toLowerCase() ?? "";
        const menu = p.representative_menu?.toLowerCase() ?? "";
        return name.includes(q) || menu.includes(q);
      });
    }
    // 카테고리 칩 필터 — 지도/리스트 양쪽 동일 적용.
    if (catFilter === "etc") {
      list = list.filter((p) => !p.pick_group);
    } else if (catFilter !== "all") {
      list = list.filter((p) => p.pick_group === catFilter);
    }
    return list;
  }, [parties, query, catFilter]);

  // AI 추천 — 그룹당 최대 4건이 되도록 데모로 패딩 (실제가 0건이면 12건 다 데모).
  const allPickRooms = useMemo(() => padPickRooms(pickRooms, 4), [pickRooms]);
  // 검색어가 있을 때는 추천 상품도 title 매칭 결과만 노출. 빈 검색은 전체 노출.
  const displayPickRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPickRooms;
    return allPickRooms.filter((r) => r.title.toLowerCase().includes(q));
  }, [allPickRooms, query]);

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

      {/* 바로 반띵하기 (AI 추천) — 지도/리스트 위에 노출. 검색 중에는 검색어로 추가 필터된 결과만 보임. */}
      <GroceryPicksSection rooms={displayPickRooms} />

      {/* 섹션 헤더 — 건수는 별도로 노출하지 않음. 토글은 카테고리 칩 아래로 이동. */}
      <div>
        <h2 className="text-[19px] font-extrabold tracking-tight text-zinc-900">
          우리동네 반띵 보기
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500">
          내 근처 반띵 주문이에요. 지도에 표시된 위치에서 만나서 거래해요.
        </p>
      </div>

      {/* 카테고리 칩 + 토글 + 주문 영역을 가로 풀폭 흰 바탕으로 묶음 */}
      <div className="-mx-4 flex flex-col gap-3 bg-white px-4 py-3">
        {/* 카테고리 칩 — 지도/리스트 어느 view에서도 항상 노출. 핫딜은 빨간 톤 */}
        <CategoryChipRow
          active={catFilter}
          onChange={(next) => setCatFilter(next)}
        />

        {view === "map" ? (
          <MapView
            parties={visibleParties}
            catFilter={catFilter}
            onPickCategory={setCatFilter}
            view={view}
            onChangeView={(v) => go({ view: v })}
            currentUserId={currentUserId}
          />
        ) : (
          // 리스트 영역 — 우상단에 보기 모드 토글이 absolute 로 떠 있음.
          <div className="relative">
            <ViewToggle
              view={view}
              onChange={(v) => go({ view: v })}
              className="absolute right-1 top-1 z-[1]"
            />
            {visibleParties.length > 0 ? (
              <div className="flex flex-col gap-2 pt-12">
                {visibleParties.map((p) => (
                  <FeedOrderRow
                    key={p.id}
                    party={p}
                    currentUserId={currentUserId}
                    onOpen={() =>
                      router.push(
                        (p.id.startsWith("demo-") ? "#" : `/feed/${p.id}`) as any,
                      )
                    }
                  />
                ))}
              </div>
            ) : query ? (
              <div className="mt-12 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400">
                <p>&ldquo;{query}&rdquo; 검색 결과가 없어요.</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

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
type MapCatFilter = "all" | PickGroup | "etc";

function MapView({
  parties,
  catFilter,
  onPickCategory,
  view,
  onChangeView,
  currentUserId,
}: {
  parties: Party[];
  catFilter: MapCatFilter;
  onPickCategory: (next: MapCatFilter) => void;
  view: View;
  onChangeView: (v: "map" | "list") => void;
  currentUserId?: string | null;
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

  const pins: MapPin[] = partyPins;

  // 데이터 바뀌어서 선택된 핀이 사라지면 선택 해제
  const selectedParty =
    selectedId ? withCoords.find((p) => p.id === selectedId) ?? null : null;

  // 핀 클릭 — 카드 선택만.
  function handlePinClick(id: string) {
    setSelectedId(id);
  }

  // onPickCategory prop은 MapView 내부에서 직접 칩 렌더를 안 하므로 사용하지 않음.
  // FeedClient 레벨에서 chip을 그리고 catFilter만 props로 받는 패턴으로 단일화.
  void onPickCategory;

  return (
    <div className="space-y-3">
      {/* 지도 + 우상단 [지도/리스트] 토글 + 우하단 "내 위치" 버튼. */}
      <div className="relative">
        <KakaoMapView
          pins={pins}
          selectedId={selectedId}
          onPinClick={handlePinClick}
          recenterTo={recenter}
          userLocation={myLoc}
        />
        <ViewToggle
          view={view}
          onChange={onChangeView}
          className="absolute right-3 top-3 z-[1] shadow-sm"
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
          currentUserId={currentUserId}
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
  currentUserId = null,
  onOpen,
}: {
  party: Party;
  highlighted?: boolean;
  currentUserId?: string | null;
  onOpen?: () => void;
}) {
  const cat = pickGroupBadge(party.pick_group);
  const slots = `${party.occupied_count}/${party.max_participants}명`;
  // 내가 만든 반띵(호스트=나)에는 '함께하기' 버튼을 숨긴다.
  const isMine = !!currentUserId && party.host_id === currentUserId;
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
        {!isMine && (
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
        )}
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
  ] as Array<{ id: MapCatFilter; label: string; emoji?: string }>;
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden">
      {chips.map((c) => {
        const on = active === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={cn(
              "shrink-0 px-1 py-1.5 text-[13px] transition",
              on
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

// ─────────────────────────────────────────────────────
// ViewToggle — 지도/리스트 보기 전환. 지도 우상단·리스트 우상단 양쪽에서 재사용.
// ─────────────────────────────────────────────────────
function ViewToggle({
  view,
  onChange,
  className,
}: {
  view: View;
  onChange: (v: "map" | "list") => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 gap-1 rounded-full border border-zinc-200 bg-white p-0.5 text-xs",
        className,
      )}
    >
      {[
        { v: "map" as const, label: "지도" },
        { v: "list" as const, label: "리스트" },
      ].map((m) => (
        <button
          key={m.v}
          type="button"
          onClick={() => onChange(m.v)}
          className={cn(
            "rounded-full px-3 py-1",
            view === m.v ? "bg-brand text-white" : "text-zinc-500",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
