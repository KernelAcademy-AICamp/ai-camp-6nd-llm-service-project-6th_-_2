"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PartyCard } from "./PartyCard";
import { FeedPromoBanner } from "./FeedPromoBanner";
import { HotDealChips } from "./HotDealChips";
import { GroceryPicksSection } from "./GroceryPicksSection";
import type { PickRoom } from "@/lib/grocery-picks";
import { KakaoMapView, type MapPin } from "./KakaoMapView";
import { displayStatusLabel, minutesUntil } from "@/lib/party-status";
import type { DisplayStatus, PartyRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type Party = PartyRow & {
  occupied_count: number;
  display_status: DisplayStatus;
  pickup_name: string | null;
  lat: number | null;
  lng: number | null;
};

type Sort = "deadline" | "latest";
type View = "list" | "map";

// 거리 필터 옵션 (반경 km). null = 전체.
const RADIUS_OPTIONS: { km: number | null; label: string }[] = [
  { km: null, label: "전체" },
  { km: 1, label: "1km" },
  { km: 3, label: "3km" },
  { km: 5, label: "5km" },
];

// 두 좌표 사이 거리(km) — Haversine.
function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

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

  // 거리 필터 — 사용자 위치 기준 반경(km). null = 전체.
  // 기준 좌표: 서버(거주지/동네) → 없으면 브라우저 위치 권한으로 폴백.
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(
    userLat !== null && userLng !== null
      ? { lat: userLat, lng: userLng }
      : null,
  );
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  // 반경 선택 — 기준 좌표가 없으면 브라우저 위치를 한 번 요청한다.
  function selectRadius(km: number | null) {
    if (km === null || loc) {
      setRadiusKm(km);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setRadiusKm(km); // 위치 못 구하면 좌표 있는 주문은 못 거르므로 그대로 둠
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRadiusKm(km);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setRadiusKm(km);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }

  // 가게명/대표 메뉴 검색 — 클라이언트 필터.
  // 탭 구분 없이 장보기·배달을 통합 노출. 검색어가 있으면 가게명/메뉴로 필터링.
  const [query, setQuery] = useState(initialQuery);
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
    // 거리 필터 — 반경 선택 시 좌표 있는 주문만 반경 내로 제한.
    if (radiusKm !== null && loc) {
      list = list.filter((p) => {
        if (p.lat === null || p.lng === null) return false;
        return distanceKm(loc.lat, loc.lng, p.lat, p.lng) <= radiusKm;
      });
    }
    return list;
  }, [parties, query, radiusKm, loc]);

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
    router.replace(`/feed?${p.toString()}`);
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

      {/* 거리 필터 + 보기 모드 토글 */}
      <div className="flex items-center justify-between gap-2">
        {/* 거리 필터 — 반경 내 주문만 노출. 기준 좌표 없으면 위치 권한 요청. */}
        <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {RADIUS_OPTIONS.map((r) => {
            const active = radiusKm === r.km;
            return (
              <button
                key={r.label}
                onClick={() => selectRadius(r.km)}
                disabled={locating}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50",
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-zinc-200 bg-white text-zinc-500",
                )}
              >
                {r.km !== null && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
                  </svg>
                )}
                {r.label}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 gap-1 rounded-full border border-zinc-200 bg-white p-0.5 text-xs">
          {[
            { v: "list", label: "주문별" },
            { v: "map", label: "지도" },
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
        <MapView parties={visibleParties} />
      ) : visibleParties.length > 0 ? (
        <div className="flex flex-col gap-3">
          {visibleParties.map((p) => (
            <PartyCard key={p.id} party={p} href={`/feed/${p.id}`} showStatus />
          ))}
        </div>
      ) : query ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-400">
          <p>&ldquo;{query}&rdquo; 검색 결과가 없어요.</p>
        </div>
      ) : radiusKm !== null ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-400">
          <p>반경 {radiusKm}km 안에는 모집중인 반띵이 없어요.</p>
        </div>
      ) : null}

      {/* 추천 방 — 모집중 주문 아래. (검색 아님·목록 보기) */}
      {!query && view === "list" && (
        <GroceryPicksSection rooms={pickRooms} />
      )}

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
    {/* 주문 등록 플로팅 버튼 — BottomNav(z-30) 위, 마이 탭 칼럼 위에 정렬.
        BottomNav가 max-w-md(28rem) 컨테이너 중앙 정렬. 4탭 균등 분할이므로
        4번째(마이) 탭의 우측 끝 ≈ 컨테이너 우측 끝.
        모바일(<28rem): 1rem 패딩, 데스크탑: 컨테이너 우측 끝에서 1rem 안쪽. */}
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
    </>
  );
}

function MapView({ parties }: { parties: Party[] }) {
  const pins: MapPin[] = parties
    .filter((p) => typeof p.lat === "number" && typeof p.lng === "number")
    .map((p) => ({
      id: p.id,
      lat: p.lat as number,
      lng: p.lng as number,
      store_name: p.store_name,
      occupied: p.occupied_count,
      max: p.max_participants,
      remain_min: minutesUntil(p.deal_at),
      display_status_label: displayStatusLabel[p.display_status],
      pickup_name: p.pickup_name,
    }));
  const missing = parties.length - pins.length;
  return (
    <div className="space-y-3">
      <KakaoMapView pins={pins} />
      {missing > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          {missing}건은 좌표 정보가 없어 지도에 표시되지 않았어요.
        </p>
      )}
      <p className="px-1 text-[11px] text-zinc-400">
        지도를 드래그해서 주변 주문을 확인할 수 있어요. 핀을 누르면 상세로 이동.
      </p>
    </div>
  );
}
