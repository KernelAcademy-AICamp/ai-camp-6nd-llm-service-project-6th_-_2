"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { PartyCard } from "./PartyCard";
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

export function FeedClient({
  parties,
  tab,
  sort,
  view,
}: {
  parties: Party[];
  tab: "delivery" | "shopping";
  sort: Sort;
  view: View;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

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

  function go(next: { tab?: string; sort?: string; view?: string }) {
    const p = new URLSearchParams();
    p.set("tab", next.tab ?? tab);
    p.set("sort", next.sort ?? sort);
    p.set("view", next.view ?? view);
    router.replace(`/feed?${p.toString()}`);
  }

  return (
    <>
    <div className="flex flex-col gap-3 p-4">
      {/* 탭 — 배달 / 장보기(준비중) */}
      <div className="flex border-b border-zinc-200">
        {[
          { v: "delivery", label: "배달", coming: false },
          { v: "shopping", label: "장보기", coming: false },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => go({ tab: t.v })}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 border-b-2 py-3 text-sm font-semibold",
              tab === t.v
                ? "border-brand text-zinc-900"
                : "border-transparent text-zinc-400",
            )}
          >
            {t.label}
            {t.coming && (
              <span className="rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium text-zinc-500">
                준비중
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 보기 모드 토글 */}
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-full border border-zinc-200 bg-white p-0.5 text-xs">
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

      {parties.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-400">
          <p>아직 모집중인 반띵이 없어요.</p>
          <Link href="/host/new" className="mt-2 inline-block text-brand">
            내가 먼저 만들어볼까요? →
          </Link>
        </div>
      ) : view === "list" ? (
        <div className="flex flex-col gap-3">
          {parties.map((p) => (
            <PartyCard key={p.id} party={p} href={`/feed/${p.id}`} showStatus />
          ))}
        </div>
      ) : (
        <MapView parties={parties} />
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
