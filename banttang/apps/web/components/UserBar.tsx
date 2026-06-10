"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

  // ─────────────────────────────────────────────
  // 경로 기반 헤더 모드 — home / subpage / hidden
  //   /chat/[uuid]          → hidden (chat이 자체 헤더 보유)
  //   /feed/[uuid]          → subpage + 미트볼 (호스트면 수정/삭제)
  //   /host/new, /host/edit/[uuid], /onboarding/* → subpage (미트볼 X)
  //   그 외(/feed, /store, /chat, /mypage)        → home
  // ─────────────────────────────────────────────
  const pathname = usePathname() ?? "";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const seg = pathname.split("/").filter(Boolean);
  let mode: "home" | "subpage" | "hidden" = "home";
  let partyIdFromPath: string | null = null;
  if (seg[0] === "chat" && seg[1] && UUID_RE.test(seg[1])) {
    mode = "hidden";
  } else if (seg[0] === "mypage" && seg[1] === "reviews") {
    // 띵동 후기 목록/상세 — 자체 헤더(← + 타이틀 인라인) 사용 → UserBar 숨김
    mode = "hidden";
  } else if (seg[0] === "feed" && seg[1] && UUID_RE.test(seg[1])) {
    mode = "subpage";
    partyIdFromPath = seg[1];
  } else if (
    (seg[0] === "host" && (seg[1] === "new" || (seg[1] === "edit" && seg[2]))) ||
    seg[0] === "onboarding" ||
    // /mypage 서브 페이지 (orders, reviews, profile 등)는 뒤로가기 노출. hub(/mypage)는 home 모드 유지.
    (seg[0] === "mypage" && seg.length > 1)
  ) {
    mode = "subpage";
  }

  // 미트볼 노출/게이트용 파티 정보 조회 (서브 + partyId 있을 때만)
  const [partyMeta, setPartyMeta] = useState<{
    host_id: string;
    status: string;
  } | null>(null);
  useEffect(() => {
    if (!partyIdFromPath) {
      setPartyMeta(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/parties/${partyIdFromPath}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setPartyMeta(j ? { host_id: j.host_id, status: j.status } : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [partyIdFromPath]);

  // hidden 모드: chat 페이지 등은 자체 헤더 사용 → null 렌더
  if (mode === "hidden") return null;

  // subpage 모드: 뒤로 + (호스트면) 미트볼
  if (mode === "subpage") {
    const isHostOfParty =
      !!partyMeta && partyMeta.host_id === user.id && !!partyIdFromPath;
    const canEdit =
      isHostOfParty &&
      (partyMeta!.status === "recruiting" ||
        partyMeta!.status === "closed" ||
        partyMeta!.status === "in_progress");
    const canDelete =
      isHostOfParty &&
      (partyMeta!.status === "recruiting" || partyMeta!.status === "closed");

    return (
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {(canEdit || canDelete) && partyIdFromPath && (
          <SubpageHostMenu
            partyId={partyIdFromPath}
            canEdit={canEdit}
            canDelete={canDelete}
            onAfterAction={() => router.refresh()}
          />
        )}
      </header>
    );
  }

  // home 모드 — 기존 마크업
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <Link href="/feed" className="text-lg font-bold text-brand" aria-label="메인으로">
          띵동
        </Link>
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

// 서브 페이지(/feed/[uuid]) 우측 미트볼 — 호스트 전용.
// 수정/삭제 메뉴, 게이트는 호출자가 canEdit / canDelete로 전달.
function SubpageHostMenu({
  partyId,
  canEdit,
  canDelete,
  onAfterAction,
}: {
  partyId: string;
  canEdit: boolean;
  canDelete: boolean;
  onAfterAction: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function handleDelete() {
    setOpen(false);
    if (!confirm("이 주문을 삭제할까요? 참여자에게 알림이 갑니다.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/parties/${partyId}/cancel`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "삭제 실패");
        return;
      }
      router.push("/feed");
      router.refresh();
      onAfterAction();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label="더보기"
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100 disabled:opacity-40"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="5" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="19" r="1.6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-black/5 bg-white py-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              if (canEdit) router.push(`/host/edit/${partyId}` as any);
            }}
            disabled={!canEdit || busy}
            className="w-full px-4 py-2.5 text-left text-sm text-zinc-800 active:bg-zinc-50 disabled:text-zinc-300"
          >
            수정하기
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleDelete}
            disabled={!canDelete || busy}
            className="w-full px-4 py-2.5 text-left text-sm text-rose-600 active:bg-rose-50 disabled:text-zinc-300"
          >
            삭제하기
          </button>
        </div>
      )}
    </div>
  );
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
