"use client";

// 마이페이지 카드 우상단 미트볼 메뉴.
//
// 상태별 동작:
//   recruiting / closed:
//     - hosted: "주문 삭제" → POST /api/parties/[id]/cancel  (전체 영향: 참여자 알림 + 파티 취소)
//     - joined: "참여 취소" → POST /api/parties/[id]/leave   (본인 빠짐)
//   completed / cancelled:
//     - hosted/joined 공통: "내 목록에서 삭제" → POST /api/parties/[id]/hide
//       (본인만 숨김 — 다른 멤버 채팅방·기록은 그대로)
//   in_progress: 비활성 (거래 중엔 삭제 불가)

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Variant = "hosted" | "joined";

type Action = {
  url: string;
  label: string;
  confirm: string;
};

function resolveAction(variant: Variant, status: string): Action | null {
  if (status === "recruiting" || status === "closed") {
    return variant === "hosted"
      ? {
          url: "cancel",
          label: "주문 삭제",
          confirm: "이 주문을 삭제할까요? 참여자에게 알림이 갑니다.",
        }
      : {
          url: "leave",
          label: "참여 취소",
          confirm: "이 주문 참여를 취소할까요?",
        };
  }
  if (status === "completed" || status === "cancelled") {
    return {
      url: "hide",
      label: "내 목록에서 삭제",
      confirm:
        "내 목록·채팅 목록에서만 사라집니다. 다른 멤버에겐 영향 없어요. 계속할까요?",
    };
  }
  return null; // in_progress 등은 비활성
}

export function PartyCardMenu({
  partyId,
  variant,
  status,
}: {
  partyId: string;
  variant: Variant;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const action = resolveAction(variant, status);
  const allowed = !!action;
  const actionLabel = action?.label ?? "삭제 불가";
  const confirmMsg = action?.confirm ?? "";

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

  async function handleAction(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    if (!action) return;
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/parties/${partyId}/${action.url}`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? `${actionLabel} 실패`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={busy}
        aria-label="더보기"
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 active:bg-zinc-100 disabled:opacity-40"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="5" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="19" r="1.6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-black/5 bg-white py-1 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleAction}
            disabled={!allowed || busy}
            className="w-full px-4 py-2.5 text-left text-sm text-rose-600 active:bg-rose-50 disabled:text-zinc-300"
          >
            {actionLabel}
          </button>
          {!allowed && (
            <p className="px-4 pb-2 text-[10px] leading-tight text-zinc-400">
              거래 진행 중인 주문은 변경 불가
            </p>
          )}
        </div>
      )}
    </div>
  );
}
