"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// 하단 4탭: 홈 / 스토어 / 채팅 / 마이.
// "주문 등록"은 홈 화면의 플로팅 버튼으로 이동.
const tabs = [
  { href: "/feed", label: "홈", icon: "🏠" },
  { href: "/store", label: "스토어", icon: "🛍️" },
  { href: "/chat", label: "채팅", icon: "💬" },
  { href: "/mypage", label: "마이", icon: "👤" },
] as const;

export function BottomNav({ chatUnreadTotal = 0 }: { chatUnreadTotal?: number }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // 채팅 안 읽음 합계는 layout에서 SSR로 계산해 prop로 받음.
  // chat_messages INSERT 일 때마다 router.refresh()로 layout 재요청 → 합계 갱신.
  // RLS상 본인이 멤버인 방의 메시지만 들어오므로 globally 구독해도 안전.
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
        .channel("bottomnav-chat-unread")
        // 새 메시지 INSERT → 안 읽음 +1
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          () => router.refresh(),
        )
        // 본인 last_read_at UPDATE → 안 읽음 0으로 재계산 (채팅 진입 후)
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

  return (
    <nav className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 border-t border-zinc-200 bg-white">
      {tabs.map((t) => {
        const active =
          pathname === t.href || (t.href !== "/feed" && pathname.startsWith(t.href));
        const showBadge = t.href === "/chat" && chatUnreadTotal > 0;
        return (
          <Link
            key={t.href}
            href={t.href as any}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-3 text-[11px]",
              active ? "text-brand" : "text-zinc-400",
            )}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span>{t.label}</span>
            {showBadge && (
              <span
                className="absolute left-1/2 top-1.5 flex h-[18px] min-w-[18px] translate-x-2 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
                aria-label={`안 읽음 ${chatUnreadTotal}개`}
              >
                {chatUnreadTotal > 999 ? "999+" : chatUnreadTotal}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
