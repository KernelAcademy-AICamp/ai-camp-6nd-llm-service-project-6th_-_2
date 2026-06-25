// 거주지 채팅방 메뉴 — 대화상대 / 신고 / 채팅방 나가기.

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { mockResidenceMemberCount } from "@/lib/residence-room";
import { ResidenceMenuClient } from "@/components/ResidenceMenuClient";

export const dynamic = "force-dynamic";

export default async function ResidenceMenuPage() {
  const me = await requireCurrentUser();
  if (!me.residence) redirect("/chat");

  return (
    <ResidenceMenuClient
      residence={me.residence}
      memberCount={mockResidenceMemberCount(me.residence)}
      myNickname={me.nickname}
    />
  );
}
