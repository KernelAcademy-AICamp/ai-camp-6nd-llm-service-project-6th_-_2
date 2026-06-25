// 거주지(건물) 채팅방 — UI 시연용 목업.
// /chat 하위에 둬서 하단 네비가 "채팅"으로 활성화되게 한다.
// "내 거주지 방만" 정책: 로그인 유저의 profiles.residence 방으로 입장.

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { mockResidenceMemberCount } from "@/lib/residence-room";
import { ResidenceChatClient } from "@/components/ResidenceChatClient";

export const dynamic = "force-dynamic";

export default async function ResidenceChatPage() {
  const me = await requireCurrentUser();
  if (!me.residence) redirect("/chat");

  return (
    <ResidenceChatClient
      residence={me.residence}
      memberCount={mockResidenceMemberCount(me.residence)}
      myNickname={me.nickname}
    />
  );
}
