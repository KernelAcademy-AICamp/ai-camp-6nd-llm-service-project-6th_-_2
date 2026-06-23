"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// 하단 5탭: 홈 / 커뮤니티 / 스토어 / 채팅 / 마이.
// "주문 등록"은 홈 화면의 플로팅 버튼으로 이동.
// 아이콘은 마이페이지(만든 주문/띵동 후기 등)와 톤을 맞춘 커스텀 SVG.
// fill은 currentColor라 활성(text-brand)/비활성(text-zinc-400) 색을 자동으로 따라간다.
const tabs = [
  { href: "/feed", label: "홈", Icon: HomeIcon },
  { href: "/community", label: "커뮤니티", Icon: CommunityIcon },
  { href: "/store", label: "스토어", Icon: BagIcon },
  { href: "/chat", label: "채팅", Icon: ChatIcon },
  { href: "/mypage", label: "마이", Icon: PersonIcon },
] as const;

export function BottomNav({ chatUnreadTotal = 0 }: { chatUnreadTotal?: number }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // 채팅 안 읽음 합계는 layout에서 SSR로 계산해 prop로 받음.
  // chat_messages INSERT / 본인 last_read_at UPDATE 시 router.refresh()로 재계산.
  // RLS상 본인이 멤버인 방의 메시지만 들어오므로 globally 구독해도 안전.
  //
  // ⚠️ refresh는 반드시 "디바운스"한다.
  //   채팅방 진입 시 읽음 처리(party_participants UPDATE)가 즉시 refresh를 부르면
  //   진행 중인 클릭 네비게이션 트랜지션과 충돌해 페이지가 안 넘어간다(먹통).
  //   짧게 모았다가 한 번만 refresh → 이동이 먼저 끝나고 배지는 곧이어 갱신됨.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!cancelled) router.refresh();
      }, 400);
    };
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
          refreshSoon,
        )
        // 본인 last_read_at UPDATE → 안 읽음 0으로 재계산 (채팅 진입 후)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "party_participants" },
          refreshSoon,
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  // 채팅방(/chat/[id])에 머무는 동안엔 💬 배지 숨김 — 보고 있는 중엔 안 읽음 숫자
  // 표시 안 함. (모바일이라 hover 대신 현재 경로로 판단)
  const inChatRoom = pathname.startsWith("/chat/");

  return (
    <nav className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 border-t border-zinc-200 bg-white">
      {tabs.map((t) => {
        const active =
          pathname === t.href || (t.href !== "/feed" && pathname.startsWith(t.href));
        const showBadge = t.href === "/chat" && chatUnreadTotal > 0 && !inChatRoom;
        return (
          <Link
            key={t.href}
            href={t.href as any}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-3 text-[11px]",
              active ? "text-brand" : "text-zinc-400",
            )}
          >
            <t.Icon active={active} />
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

// ── 탭 아이콘 ────────────────────────────────────────────────
// 모두 viewBox 24, fill="currentColor"로 통일 → 활성/비활성 색을 부모 text 색에서 상속.
// 활성 시엔 꽉 찬 실루엣, 비활성 시엔 1.8 두께 외곽선으로 무게감 차이를 준다.
type TabIconProps = { active?: boolean };

// 홈
function HomeIcon({ active }: TabIconProps) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.3 3.5 3.7 9.6A2 2 0 0 0 3 11.1V20a1 1 0 0 0 1 1h4.5v-5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5H20a1 1 0 0 0 1-1v-8.9a2 2 0 0 0-.7-1.5l-7.6-6.1a1.1 1.1 0 0 0-1.4 0Z" />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 커뮤니티 — 이웃(두 사람). 머리=온전한 원 2개 + 어깨 곡선 2개로 또렷하게.
function CommunityIcon({ active }: TabIconProps) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {/* 뒷사람 */}
      <circle cx="16.6" cy="9.3" r="2.5" />
      <path d="M16.6 14c2.6 0 4.4 1.8 4.4 4.4a.7.7 0 0 1-.7.7h-3.7v-.5c0-1.7-.6-3.2-1.6-4.4.4-.1.8-.2 1.2-.2Z" />
      {/* 앞사람 */}
      <circle cx="9.2" cy="8.6" r="3.2" />
      <path d="M9.2 13.2c3.3 0 5.7 2.1 5.7 5.2a.7.7 0 0 1-.7.7H4.2a.7.7 0 0 1-.7-.7c0-3.1 2.4-5.2 5.7-5.2Z" />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* 뒷사람 */}
      <circle cx="16.6" cy="9.3" r="2.3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M16.3 14.1c.4-.07.8-.1 1.2-.1 2.4 0 4 1.7 4 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* 앞사람 */}
      <circle cx="9.2" cy="8.6" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.7 18.3c0-3 2.4-5 5.5-5s5.5 2 5.5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 스토어 — 쇼핑백
function BagIcon({ active }: TabIconProps) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.2 7.5h11.6l.86 11.6A2 2 0 0 1 16.67 21H7.33a2 2 0 0 1-1.99-1.9L6.2 7.5Z" />
      <path
        d="M8.7 9V6.9a3.3 3.3 0 0 1 6.6 0V9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.4 7.8h11.2l.82 11A1.6 1.6 0 0 1 16.83 20.5H7.17a1.6 1.6 0 0 1-1.59-1.7l.82-11Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.7 9V6.9a3.3 3.3 0 0 1 6.6 0V9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 채팅 — 말풍선
function ChatIcon({ active }: TabIconProps) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6.6L7 19.3a.6.6 0 0 1-1-.5V16a2 2 0 0 1-2-2V6Z" />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.8 6.2A1.8 1.8 0 0 1 6.6 4.5h10.8a1.8 1.8 0 0 1 1.8 1.7V14a1.8 1.8 0 0 1-1.8 1.8h-6.2L7 18.8a.5.5 0 0 1-.8-.4v-2.6A1.8 1.8 0 0 1 4.8 14V6.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 마이 — 사람
function PersonIcon({ active }: TabIconProps) {
  return active ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 19.5c0-3.9 3.36-6.5 7.5-6.5s7.5 2.6 7.5 6.5a.9.9 0 0 1-.9.9H5.4a.9.9 0 0 1-.9-.9Z" />
    </svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.2 19.4c0-3.6 3.05-6 6.8-6s6.8 2.4 6.8 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
