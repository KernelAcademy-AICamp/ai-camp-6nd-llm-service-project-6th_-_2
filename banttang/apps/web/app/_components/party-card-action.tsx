"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { askConfirm, showInfo } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import type { ParticipantStatus, PartyStatus } from "@/lib/types/domain";

interface Props {
  partyId: string;
  status: PartyStatus;
  // 호스트는 항상 'approved' + is_host=true. 호스트 여부도 같이 받는다.
  isHost: boolean;
  // 본인의 party_participants 상태 (없으면 null).
  myStatus: ParticipantStatus | null;
  isLoggedIn: boolean;
}

// 홈 카드 우측 액션 버튼.
// 정책: 신청 → 'pending' 상태 → 호스트 승인 시 'approved'로 전환되어야 채팅방 진입 가능.
//
// 상태별:
//   - 미로그인 → 로그인 유도
//   - 호스트 / approved → 채팅방 입장
//   - pending → "승인 대기 중" 버튼 (클릭 시 신청 취소 확인)
//   - rejected → 참여 거절됨 (비활성)
//   - null/cancelled (= 신청 적 없음 or 이전에 취소) + party recruiting → 참여하기
//   - 그 외 (정원 마감/종료) + 비참여 → 참여 불가
export function PartyCardAction({
  partyId,
  status,
  isHost,
  myStatus,
  isLoggedIn,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function go() {
    router.push(`/parties/${partyId}`);
  }

  async function join() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?next=/parties/${partyId}`);
        return;
      }
      // 정책: 신청은 항상 'pending'. 호스트가 'approved'로 전환해야 채팅방 진입 가능.
      const { error: insErr } = await supabase
        .from("party_participants")
        .upsert(
          {
            party_id: partyId,
            user_id: user.id,
            status: "pending",
            is_host: false,
          },
          { onConflict: "party_id,user_id" },
        );
      if (insErr) throw insErr;
      router.refresh();
      await showInfo({
        title: "신청을 보냈어요!",
        description:
          "호스트가 수락하면 채팅방에 입장할 수 있어요.\n승인 결과는 알림으로 알려드릴게요.",
        confirmText: "확인",
      });
    } catch (err) {
      await showInfo({
        title: "신청에 실패했어요",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해주세요.",
        confirmText: "확인",
      });
    } finally {
      setBusy(false);
    }
  }

  async function cancelApplication() {
    if (busy) return;
    const ok = await askConfirm({
      title: "참여 신청을 취소할까요?",
      description: "취소 후에도 다시 신청할 수 있어요.",
      confirmText: "신청 취소",
      cancelText: "유지",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // 본인의 row만 status='cancelled'로 (RLS: participants_update_self_or_host)
      const { error } = await supabase
        .from("party_participants")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("party_id", partyId)
        .eq("user_id", user.id);
      if (error) throw error;
      router.refresh();
    } catch (err) {
      await showInfo({
        title: "취소에 실패했어요",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해주세요.",
        confirmText: "확인",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => router.push(`/login?next=/parties/${partyId}`)}
      >
        로그인하고 참여
      </Button>
    );
  }

  // 호스트 본인 — 항상 채팅방 입장 가능
  if (isHost) {
    return (
      <Button size="sm" onClick={go}>
        채팅방 입장
      </Button>
    );
  }

  if (myStatus === "approved") {
    return (
      <Button size="sm" onClick={go}>
        채팅방 입장
      </Button>
    );
  }

  // 승인 대기 중 — 본인이 신청 취소 가능. 라벨/액션을 한눈에 알 수 있게 ✕ 아이콘 추가.
  if (myStatus === "pending") {
    return (
      <button
        type="button"
        onClick={cancelApplication}
        disabled={busy}
        title="신청 취소하기"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
          "bg-amber-50 text-amber-800 ring-1 ring-amber-200 active:bg-amber-100",
          "disabled:opacity-60",
        )}
      >
        <span>승인 대기 중</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    );
  }

  if (myStatus === "rejected") {
    return (
      <Button size="sm" variant="ghost" disabled className="opacity-60">
        참여 거절됨
      </Button>
    );
  }

  // null / cancelled / no_show — 신규 신청 가능 (party가 recruiting일 때만)
  if (status === "recruiting") {
    return (
      <Button size="sm" onClick={join} disabled={busy}>
        {busy ? "신청 중…" : "참여하기"}
      </Button>
    );
  }

  // 정원 마감 / 진행 중 / 완료 / 취소 + 비참여
  return (
    <Button size="sm" variant="ghost" disabled className="opacity-60">
      참여 불가
    </Button>
  );
}
