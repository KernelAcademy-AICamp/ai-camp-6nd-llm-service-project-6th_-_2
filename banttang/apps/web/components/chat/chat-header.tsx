"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  // 호스트가 모집 글 삭제 (DB는 status='cancelled' soft-delete).
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

const CATEGORY_LABEL: Record<PartyWithStats["category"], string> = {
  delivery: "배달 같이",
  offline_shopping: "장보기 소분",
  online_shopping: "온라인 공구",
};

// 호스트용: 비-호스트 멤버 중 하나를 골라 강퇴.
// 멤버가 한 명이면 곧장 호출, 둘 이상이면 드롭다운으로 선택.
function HostKickMenu({
  members,
  onKick,
  disabled,
}: {
  members: Pick<UserProfile, "id" | "nickname">[];
  onKick: (memberUserId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (members.length === 0) return null;

  function trigger() {
    if (members.length === 1) {
      onKick(members[0].id);
    } else {
      setOpen((o) => !o);
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={trigger}
        disabled={disabled}
        className="h-7 text-[11px] text-red-700 hover:bg-red-50"
      >
        파티원 내보내기
      </Button>
      {open && members.length > 1 && (
        <div className="absolute right-0 top-full z-10 mt-1 flex min-w-[140px] flex-col gap-0.5 rounded-md border border-foreground/10 bg-background p-1 shadow-md">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onKick(m.id);
                setOpen(false);
              }}
              disabled={disabled}
              className={cn(
                "rounded px-2 py-1 text-left text-[11px] hover:bg-red-50 hover:text-red-700",
              )}
            >
              {m.nickname}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const canHostComplete =
    isHost && (party.status === "closed" || party.status === "in_progress");
  const canMemberReview = !isHost && party.status === "completed";

  return (
    <header className="border-b border-foreground/10 bg-background px-4 py-3">
      {/* 1줄: 카테고리·상태, 가게명, 인원 + 주요 액션(거래 완료/평가하기) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-foreground/50">
            {CATEGORY_LABEL[party.category]} · {STATUS_LABEL[party.status]}
          </p>
          <h1 className="line-clamp-1 text-base font-semibold">{party.store_name}</h1>
          <p className="text-xs text-foreground/60">
            {party.approved_count} / {party.max_participants}명
          </p>
        </div>

        {canHostComplete && (
          <Button size="sm" onClick={onOpenComplete} disabled={managing}>
            거래 완료
          </Button>
        )}
        {canMemberReview && (
          <Button size="sm" variant="secondary" onClick={onOpenReview} disabled={managing}>
            평가하기
          </Button>
        )}
      </div>

      {/* 2줄: 참여자 칩 (호스트일 땐 비-호스트 멤버 옆에 강퇴 ✕) */}
      {participants.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {participants.map((p) => {
            const isThisHost = p.id === hostId;
            const showKick = isHost && canManage && !isThisHost && onKickMember;
            return (
              <div
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.04] px-2 py-0.5"
              >
                <Avatar nickname={p.nickname} size={20} />
                <span className="text-[11px] text-foreground/70">
                  {p.nickname}
                  {isThisHost && (
                    <span className="ml-0.5 text-[10px] text-brand">·호스트</span>
                  )}
                </span>
                {showKick && (
                  <button
                    type="button"
                    onClick={() => onKickMember?.(p.id)}
                    disabled={managing}
                    aria-label={`${p.nickname} 내보내기`}
                    title="파티원 내보내기"
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-foreground/40 hover:bg-red-100 hover:text-red-700 disabled:opacity-40"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3줄: 관리 액션 (영수증 인증 전까지만 노출) */}
      {canManage && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-foreground/10 pt-2">
          {isHost && onKickMember && (
            <HostKickMenu
              members={participants.filter((p) => p.id !== hostId)}
              onKick={onKickMember}
              disabled={managing}
            />
          )}
          {isHost && onDeleteParty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDeleteParty}
              disabled={managing}
              className="h-7 text-[11px] text-red-700 hover:bg-red-50"
            >
              글 삭제
            </Button>
          )}
          {!isHost && onLeaveParty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLeaveParty}
              disabled={managing}
              className="h-7 text-[11px] text-red-700 hover:bg-red-50"
            >
              채팅방 나가기
            </Button>
          )}
        </div>
      )}
    </header>
  );
}
