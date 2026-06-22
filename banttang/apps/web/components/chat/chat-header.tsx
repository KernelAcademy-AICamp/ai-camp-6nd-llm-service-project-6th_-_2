"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  // 멤버가 완료된 거래의 평가 시트를 열 때.
  onOpenReview?: () => void;
  // 거래카드 모달 열기.
  onOpenTransactionCard?: () => void;
  // 관리 액션(강퇴/나가기) 노출 게이트.
  canManage?: boolean;
  // 관리 액션 진행 중 — 버튼 비활성화.
  managing?: boolean;
  // 호스트가 멤버를 강퇴 (user_id 전달).
  onKickMember?: (memberUserId: string) => void;
  // 파티원이 본인 채팅방에서 나가기.
  onLeaveParty?: () => void;
  // 헤더(sticky) 안에 함께 고정 노출할 단계 안내 배너 등.
  notice?: React.ReactNode;
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
  onOpenReview,
  onOpenTransactionCard,
  canManage = false,
  managing = false,
  onKickMember,
  onLeaveParty,
  notice,
}: Props) {
  const router = useRouter();
  const canMemberReview = !isHost && party.status === "completed";

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

        {/* 가게명/상태/요약 — 클릭 시 작성한 모집글로 이동 */}
        <Link
          href={`/feed/${party.id}` as any}
          className="block min-w-0 flex-1 rounded-md transition-colors active:bg-black/[0.04]"
          aria-label={`${party.store_name} 모집글 보기`}
        >
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
        </Link>

        {onOpenTransactionCard && (
          <button
            type="button"
            onClick={onOpenTransactionCard}
            className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-brand/10 px-3 text-[13px] font-semibold text-brand transition-colors active:bg-brand/15"
            aria-label="반띵 카드 보기"
          >
            <span aria-hidden>🪪</span>
            <span>반띵 카드 보기</span>
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

        <OverflowMenu
          isHost={isHost}
          hostId={hostId}
          participants={participants}
          managing={managing}
          onKickMember={onKickMember}
          onLeaveParty={onLeaveParty}
        />
      </div>

      {/* 단계 안내 배너 — 헤더와 함께 sticky 고정 (페이지 스크롤해도 상단 유지) */}
      {notice}
    </header>
  );
}

function OverflowMenu({
  isHost,
  hostId,
  participants,
  managing,
  onKickMember,
  onLeaveParty,
}: {
  isHost: boolean;
  hostId: string;
  participants: Pick<UserProfile, "id" | "nickname">[];
  managing: boolean;
  onKickMember?: (memberUserId: string) => void;
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
  const showLeave = !isHost && !!onLeaveParty;
  // 호스트를 가장 앞에
  const sortedParticipants = [...participants].sort((a, b) =>
    a.id === hostId ? -1 : b.id === hostId ? 1 : 0,
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={managing}
        aria-label="더보기"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors active:bg-black/[0.04] disabled:opacity-40"
      >
        {participants.length <= 2 ? (
          // 1:1 방 — 미트볼
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="5" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="19" r="1.6" fill="currentColor" />
          </svg>
        ) : (
          // 다대다 방 — 햄버거
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-2 top-full z-20 mt-1 min-w-[220px] overflow-hidden rounded-2xl border border-black/5 bg-white py-1 shadow-xl"
        >
          {/* 참여자 목록 */}
          {sortedParticipants.length > 0 && (
            <div className="px-4 pb-2 pt-3">
              <p className="mb-2 text-[11px] font-semibold text-gray-400">
                참여자 {sortedParticipants.length}명
              </p>
              <ul className="flex flex-col gap-2">
                {sortedParticipants.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Avatar nickname={p.nickname} size={26} />
                    <span className="truncate text-[13px] text-gray-800">
                      {p.nickname}
                    </span>
                    {p.id === hostId && (
                      <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                        호스트
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(showKickItem || showLeave) && (
            <div className="my-1 border-t border-black/5" />
          )}

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
