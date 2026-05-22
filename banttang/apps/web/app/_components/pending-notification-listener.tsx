"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  // 호스트가 소유한 파티 ID들. 이 파티들의 party_participants 변화를 구독한다.
  partyIds: string[];
}

// 호스트용 패시브 알림 리스너 — pending INSERT/UPDATE 발생 시 자동으로 router.refresh.
// 별도 UI 없이 백그라운드에서만 동작. (페이지 자체의 배너/배지가 갱신됨.)
export function PendingNotificationListener({ partyIds }: Props) {
  const router = useRouter();
  const partyIdsKey = partyIds.slice().sort().join(",");
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    if (partyIds.length === 0) return;
    const supabase = createClient();

    // Realtime은 in() 필터를 직접 지원하지 않아서 party_participants 전체를 받고 클라이언트에서 필터링.
    // 부담이 크지 않음(스키마상 INSERT 빈도 낮음).
    const channel = supabase
      .channel("host-pending-watch")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "party_participants" },
        (payload) => {
          const row = payload.new as { party_id: string; status: string };
          if (!partyIds.includes(row.party_id)) return;
          if (row.status !== "pending") return;
          // refresh 폭주 방지(2초 throttle)
          const now = Date.now();
          if (now - lastRefreshAtRef.current < 2000) return;
          lastRefreshAtRef.current = now;
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "party_participants" },
        (payload) => {
          const row = payload.new as { party_id: string; status: string };
          if (!partyIds.includes(row.party_id)) return;
          // pending 상태 변경(승인/거절/취소) 시도 화면 갱신
          const now = Date.now();
          if (now - lastRefreshAtRef.current < 2000) return;
          lastRefreshAtRef.current = now;
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyIdsKey]);

  return null;
}
