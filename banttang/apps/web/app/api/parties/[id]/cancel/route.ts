import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

// 호스트의 주문 삭제(취소)
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();
    const { data: party } = await sb
      .from("parties")
      .select("id, host_id, status")
      .eq("id", params.id)
      .maybeSingle();
    if (!party) return NextResponse.json({ error: "주문 없음" }, { status: 404 });
    if (party.host_id !== me.id)
      return NextResponse.json({ error: "호스트만 가능" }, { status: 403 });

    const { error } = await sb
      .from("parties")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "host_cancelled",
      })
      .eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 채팅방이 열려 있었다면 취소 시스템 메시지
    const { data: room } = await sb
      .from("chat_rooms")
      .select("id")
      .eq("party_id", params.id)
      .maybeSingle();
    if (room) {
      await sb.from("chat_messages").insert({
        room_id: room.id,
        sender_id: null,
        type: "system",
        content: "호스트가 이 반띵을 취소했어요. 다른 반띵을 찾아볼까요?",
        metadata: { kind: "party_cancelled" },
      });
    }

    // 참여자에게 알림
    const { data: members } = await sb
      .from("party_participants")
      .select("user_id, is_host")
      .eq("party_id", params.id);
    for (const m of members ?? []) {
      if (m.is_host) continue;
      await sb.from("notifications").insert({
        user_id: m.user_id,
        type: "application_rejected",
        title: "주문이 취소됐어요",
        body: "호스트가 반띵을 취소했어요.",
        related_party_id: params.id,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
