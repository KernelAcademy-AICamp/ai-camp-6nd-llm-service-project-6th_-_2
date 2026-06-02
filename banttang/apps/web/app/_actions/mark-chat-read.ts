"use server";

// 채팅방 진입 시 본인 참여 row의 last_read_at을 NOW()로 갱신(= 읽음 처리).
//
// ⚠️ 절대 페이지 "렌더 도중"에 호출하지 말 것!
//   렌더 중 UPDATE → Realtime party_participants UPDATE 이벤트 → BottomNav/ChatListRealtime의
//   router.refresh() → 페이지 재렌더 → 또 UPDATE → ... 무한 루프(클릭 이동 시 먹통).
//   그래서 이 액션은 PartyChatContainer의 "마운트 1회" useEffect에서만 호출한다.
//   마운트 effect는 router.refresh()로 재실행되지 않으므로 루프가 끊긴다.

import { createClient } from "@/lib/supabase/server";

export async function markChatRead(partyId: string): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // RLS-aware로 본인 row만 UPDATE.
    await supabase
      .from("party_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("party_id", partyId)
      .eq("user_id", user.id);
  } catch {
    // 읽음 갱신 실패는 비치명적 — 채팅 흐름엔 영향 없음.
  }
}
