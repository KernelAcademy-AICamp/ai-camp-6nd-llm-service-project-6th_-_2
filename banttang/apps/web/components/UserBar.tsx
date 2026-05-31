"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
};

export function UserBar({
  user,
  address,
  notifications,
}: {
  user: CurrentUser;
  address?: string | null;
  notifications: NotificationItem[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(notifications);
  const unreadCount = items.filter((n) => !n.is_read).length;

  // Realtime: notifications 테이블 INSERT/UPDATE 구독.
  // 새 알림 INSERT 시 prepend, 읽음 처리 등 UPDATE 시 in-place 반영.
  // RLS-aware Realtime 위해 setAuth로 access_token 박은 뒤 subscribe.
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
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as NotificationItem;
            setItems((prev) =>
              prev.some((n) => n.id === row.id)
                ? prev
                : [row, ...prev].slice(0, 20),
            );
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as NotificationItem;
            setItems((prev) => prev.map((n) => (n.id === row.id ? row : n)));
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, user.id]);

  async function openNotif() {
    setShowNotif(true);
    if (unreadCount === 0) return;
    // 낙관적 업데이트 — 배지 즉시 제거
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await fetch("/api/notifications/read", { method: "POST" });
    } catch {
      // 실패해도 다음 새로고침 때 재동기화
    }
  }

  async function logout() {
    setShowLogoutConfirm(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  async function resetAddress() {
    await fetch("/api/onboarding/address", { method: "DELETE" });
    router.push("/onboarding/address");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-brand">띵동</span>
        <button
          onClick={resetAddress}
          className="text-xs text-zinc-400 hover:text-brand"
          title="위치 다시 설정"
        >
          📍 {address ?? "위치 설정"}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">{user.nickname}</span>
        <button
          onClick={openNotif}
          className="relative rounded p-1 text-base leading-none hover:bg-zinc-100"
          aria-label="알림"
          title="알림"
        >
          🔔
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100"
        >
          로그아웃
        </button>
      </div>

      {showNotif && (
        <div
          onClick={() => setShowNotif(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h3 className="text-lg font-semibold">알림</h3>
              <button
                onClick={() => setShowNotif(false)}
                className="text-xs text-zinc-400 hover:text-zinc-700"
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-zinc-400">
                  아직 받은 알림이 없어요.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {items.map((n) => (
                    <li key={n.id}>
                      <NotifRow n={n} onClose={() => setShowNotif(false)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div
          onClick={() => setShowLogoutConfirm(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl"
          >
            <h3 className="text-lg font-semibold">로그아웃 할까요?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              다시 이용하려면 로그인해야 해요.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl border border-zinc-200 py-2"
              >
                취소
              </button>
              <button
                onClick={logout}
                className="flex-1 rounded-xl bg-brand py-2 text-white"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function NotifRow({ n, onClose }: { n: NotificationItem; onClose: () => void }) {
  const content = (
    <div className={cn("px-5 py-3", !n.is_read && "bg-brand-50/40")}>
      <p className="text-sm font-medium text-zinc-900">{n.title}</p>
      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{n.body}</p>}
      <p className="mt-1 text-[10px] text-zinc-400">{formatRelative(n.created_at)}</p>
    </div>
  );
  if (n.link_path) {
    return (
      <Link href={n.link_path as any} onClick={onClose} className="block hover:bg-zinc-50">
        {content}
      </Link>
    );
  }
  return content;
}

function formatRelative(iso: string): string {
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}일 전`;
  // 일주일 넘은 알림은 날짜 표기
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
