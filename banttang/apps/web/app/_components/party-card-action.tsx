"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { closePartyIfFull } from "@/app/_actions/party-lifecycle";
import type { PartyStatus } from "@/lib/types/domain";

interface Props {
  partyId: string;
  status: PartyStatus;
  // 서버 컴포넌트에서 본인 참여 여부를 미리 계산해 넘긴다.
  isMember: boolean;
  isLoggedIn: boolean;
}

// 홈 카드 우측에 붙는 액션 버튼.
// 상태별 분기:
//   - 미로그인: 로그인하러 가기
//   - 참여자: 채팅방으로
//   - 모집중 비참여자: 참여하기 → INSERT → /parties/[id]
//   - 그 외: 비활성 (정원 찼거나 종료된 거래)
export function PartyCardAction({ partyId, status, isMember, isLoggedIn }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go() {
    router.push(`/parties/${partyId}`);
  }

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?next=/parties/${partyId}`);
        return;
      }
      // participants_insert_self RLS: auth.uid()=user_id, is_host=false. status 제한 없음.
      // 정원 충족 시 on_participant_approved 트리거가 closed 전이 + chat_rooms 생성.
      const { error: insErr } = await supabase
        .from("party_participants")
        .upsert(
          {
            party_id: partyId,
            user_id: user.id,
            status: "approved",
            is_host: false,
          },
          { onConflict: "party_id,user_id" },
        );
      if (insErr) throw insErr;
      // 정원 충족 시 admin이 마감 + 채팅방 생성 (트리거가 SECURITY DEFINER가 아니라 RLS로 막히는 케이스 보정)
      await closePartyIfFull(partyId);
      router.push(`/parties/${partyId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "참여 실패");
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

  if (isMember) {
    return (
      <Button size="sm" onClick={go}>
        채팅방 입장
      </Button>
    );
  }

  if (status === "recruiting") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" onClick={join} disabled={busy}>
          {busy ? "참여 중…" : "참여하기"}
        </Button>
        {error && <p className="text-[10px] text-red-700">{error}</p>}
      </div>
    );
  }

  // closed/in_progress/completed/cancelled & not member
  return (
    <Button size="sm" variant="ghost" disabled className="opacity-60">
      참여 불가
    </Button>
  );
}
