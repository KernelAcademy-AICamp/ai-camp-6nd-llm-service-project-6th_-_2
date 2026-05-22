import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

// 호스트가 '주문 진행' 수락 → 전체 pending → approved
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();
    const { data: party } = await sb
      .from("parties")
      .select("id, host_id, status, max_participants")
      .eq("id", params.id)
      .maybeSingle();
    if (!party) return NextResponse.json({ error: "주문 없음" }, { status: 404 });
    if (party.host_id !== me.id)
      return NextResponse.json({ error: "호스트만 가능" }, { status: 403 });
    if (party.status !== "recruiting")
      return NextResponse.json({ error: "이미 진행 중" }, { status: 400 });

    const { error } = await sb
      .from("party_participants")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("party_id", params.id)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 트리거가 정원 충족 시 status=closed + chat_room + 시스템 메시지 자동 생성

    // 참여자 전원에게 알림
    const { data: members } = await sb
      .from("party_participants")
      .select("user_id, is_host")
      .eq("party_id", params.id);
    for (const m of members ?? []) {
      if (m.is_host) continue;
      await sb.from("notifications").insert({
        user_id: m.user_id,
        type: "application_approved",
        title: "호스트가 수락했어요!",
        body: "채팅방이 열렸습니다.",
        link_path: `/chat/${params.id}`,
        related_party_id: params.id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
