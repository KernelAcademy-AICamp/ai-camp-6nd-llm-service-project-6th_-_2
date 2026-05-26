"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { MemberKickSheet } from "./member-kick-sheet";
import type { PartyStatus, PartyWithStats, UserProfile } from "@/lib/types/domain";

interface Props {
  party: PartyWithStats;
  participants: Pick<UserProfile, "id" | "nickname">[];
  hostId: string;
  isHost: boolean;
  // 호스트가 거래 완료 시트를 열 때.
  onOpenComplete: () => void;
  // 멤버가 완료된 거래의 평가 시트를 열 때.
  onOpenReview?: () => void;
  // 영수증 인증 전이고 종료 전인 상태 — 관리 액션(삭제/강퇴/나가기) 노출 게이트.
  canManage?: boolean;
  // 관리 액션 진행 중 — 버튼 비활성화.
  managing?: boolean;
  // 호스트가 멤버를 강퇴 (user_id 전달).
  onKickMember?: (memberUserId: string) => void;
  // 호스트가 모집 글 삭제.
  onDeleteParty?: () => void;
  // 파티원이 본인 채팅방에서 나가기.
  onLeaveParty?: () => void;
}

const STATUS_LABEL: Record<PartyStatus, string> = {
  recruiting: "모집 중",
  closed: "모집 완료",
  in_progress: "거래 중",
  completed: "거래 완료",
  cancelled: "취소됨",
};

const STATUS_TONE: Record<PartyStatus, string> = {
  recruiting: "bg-emerald-50 text-emerald-700",
  closed: "bg-amber-50 text-amber-700",
  in_progress: "bg-sky-50 text-sky-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-rose-50 text-rose-700",
};

const CATEGORY_LABEL: Record<PartyWithStats["category"], string> = {
  delivery: "배달 같이",
  offline_shopping: "장보기 소분",
  online_shopping: "온라인 공구",
};

export function ChatHeader({
  party,
  participants,
  hostId,
  isHost,
  onOpenComplete,
  onOpenReview,
  canManage = false,
  managing = false,
  onKickMember,
  onDeleteParty,
  onLeaveParty,
}: Props) {
  const router = useRouter();
  const canHostComplete =
    isHost && (party.status === "closed" || party.status === "in_progress");
  const canMemberReview = !isHost && party.status === "completed";

  const hasMenu =
    canManage &&
    ((isHost && (onDeleteParty || (onKickMember && participants.some((p) => p.id !== hostId)))) ||
      (!isHost && !!onLeaveParty));

  return (
    <header className="sticky top-0 z-10 border-b border-black/[0.06] bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      {/* 1줄: 뒤로 / 타이틀+상태 / 우측 메뉴 */}
      <div className="flex items-center gap-2 px-2 py-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors active:bg-black/[0.04]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-[16px] font-bold text-gray-900">
              {party.store_name}
            </h1>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                STATUS_TONE[party.status],
              )}
            >
              {STATUS_LABEL[party.status]}
            </span>
          </div>
          <p className="truncate text-[11px] text-gray-500">
            {CATEGORY_LABEL[party.category]} · {party.approved_count}/{party.max_participants}명
          </p>
        </div>

        {canHostComplete && (
          <button
            type="button"
            onClick={onOpenComplete}
            disabled={managing}
            className="h-9 shrink-0 rounded-full bg-brand px-3.5 text-[13px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-50"
          >
            거래 완료
          </button>
        )}
        {canMemberReview && (
          <button
            type="button"
            onClick={onOpenReview}
            disabled={managing}
            className="h-9 shrink-0 rounded-full bg-gray-100 px-3.5 text-[13px] font-semibold text-gray-800 transition-colors active:bg-gray-200 disabled:opacity-50"
          >
            평가하기
          </button>
        )}

        {hasMenu && (
          <OverflowMenu
            isHost={isHost}
            hostId={hostId}
            participants={participants}
            managing={managing}
            onKickMember={onKickMember}
            onDeleteParty={onDeleteParty}
            onLeaveParty={onLeaveParty}
          />
        )}
      </div>

      {/* 2줄: 참여자 아바타 스택 */}
      {participants.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-2.5">
          <AvatarStack
            participants={participants}
            hostId={hostId}
            max={4}
          />
          <span className="text-[12px] text-gray-500">
            {participants.find((p) => p.id === hostId)?.nickname ?? "호스트"}
            <span className="text-gray-300"> · </span>
            <span className="text-gray-400">호스트</span>
          </span>
        </div>
      )}
    </header>
  );
}

function AvatarStack({
  participants,
  hostId,
  max,
}: {
  participants: Pick<UserProfile, "id" | "nickname">[];
  hostId: string;
  max: number;
}) {
  // 호스트를 가장 앞에 두기
  const sorted = [...participants].sort((a, b) => {
    if (a.id === hostId) return -1;
    if (b.id === hostId) return 1;
    return 0;
  });
  const visible = sorted.slice(0, max);
  const rest = sorted.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((p, i) => (
        <span
          key={p.id}
          className="rounded-full ring-2 ring-white"
          style={{ marginLeft: i === 0 ? 0 : -8, zIndex: visible.length - i }}
        >
          <Avatar nickname={p.nickname} size={26} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="ml-[-8px] flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-600 ring-2 ring-white"
          style={{ zIndex: 0 }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

function OverflowMenu({
  isHost,
  hostId,
  participants,
  managing,
  onKickMember,
  onDeleteParty,
  onLeaveParty,
}: {
  isHost: boolean;
  hostId: string;
  participants: Pick<UserProfile, "id" | "nickname">[];
  managing: boolean;
  onKickMember?: (memberUserId: string) => void;
  onDeleteParty?: () => void;
  onLeaveParty?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kickSheetOpen, setKickSheetOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const kickableMembers = participants.filter((p) => p.id !== hostId);
  const showKickItem = isHost && !!onKickMember && kickableMembers.length > 0;
  const showDelete = isHost && !!onDeleteParty;
  const showLeave = !isHost && !!onLeaveParty;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={managing}
        aria-label="더보기"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors active:bg-black/[0.04] disabled:opacity-40"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="5" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="19" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-2 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-2xl border border-black/5 bg-white py-1 shadow-xl"
        >
          {showKickItem && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (kickableMembers.length === 1) {
                  // 한 명뿐이면 곧장 confirm으로 — 시트는 불필요
                  onKickMember!(kickableMembers[0].id);
                } else {
                  setKickSheetOpen(true);
                }
              }}
              disabled={managing}
              className="w-full px-4 py-2.5 text-left text-[14px] text-gray-800 transition-colors active:bg-gray-50 disabled:opacity-40"
            >
              파티원 내보내기
            </button>
          )}
          {showDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDeleteParty!();
                setOpen(false);
              }}
              disabled={managing}
              className="w-full px-4 py-2.5 text-left text-[14px] text-rose-600 transition-colors active:bg-rose-50 disabled:opacity-40"
            >
              모집 글 삭제
            </button>
          )}
          {showLeave && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onLeaveParty!();
                setOpen(false);
              }}
              disabled={managing}
              className="w-full px-4 py-2.5 text-left text-[14px] text-rose-600 transition-colors active:bg-rose-50 disabled:opacity-40"
            >
              채팅방 나가기
            </button>
          )}
        </div>
      )}

      {showKickItem && (
        <MemberKickSheet
          open={kickSheetOpen}
          onClose={() => setKickSheetOpen(false)}
          members={kickableMembers}
          onSelect={(id) => onKickMember!(id)}
          disabled={managing}
        />
      )}
    </div>
  );
}
