"use client";

// 채팅 목록 페이지에서 새 메시지가 들어오면 SSR 재요청해 안 읽음 카운트를 갱신.
// chat_messages INSERT는 RLS상 본인이 멤버인 방의 메시지만 들어와서 globally 구독해도 안전.

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ChatListRealtime() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

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
        .channel("chat-list-live")
        // 새 메시지 INSERT → 카드별 안 읽음 +1
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          () => router.refresh(),
        )
        // 본인 last_read_at UPDATE → 카드별 안 읽음 0
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "party_participants" },
          () => router.refresh(),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  return null;
}
