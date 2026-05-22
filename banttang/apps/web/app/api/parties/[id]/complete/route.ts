import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

// 거래 완료 처리. 호스트가 호출.
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
    if (party.status === "completed")
      return NextResponse.json({ ok: true, already: true });

    // 영수증 인증이 있는지 검사
    const { count } = await sb
      .from("receipts")
      .select("*", { count: "exact", head: true })
      .eq("party_id", params.id);
    if (!count) return NextResponse.json({ error: "영수증 인증이 필요해요" }, { status: 400 });

    const { error } = await sb
      .from("parties")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 채팅 시스템 메시지
    const { data: room } = await sb
      .from("chat_rooms")
      .select("id")
      .eq("party_id", params.id)
      .maybeSingle();
    if (room) {
      await sb.from("chat_messages").insert({
        room_id: room.id,
        type: "system",
        system_event: "party_completed",
        content: "거래가 완료되었어요. 서로 평가를 남겨주세요!",
      });
    }

    // 평가 요청 알림
    const { data: members } = await sb
      .from("party_participants")
      .select("user_id")
      .eq("party_id", params.id)
      .eq("status", "approved");
    for (const m of members ?? []) {
      await sb.from("notifications").insert({
        user_id: m.user_id,
        type: "review_requested",
        title: "반띵 어땠어요?",
        body: "함께한 파티원을 평가해주세요.",
        link_path: `/chat/${params.id}`,
        related_party_id: params.id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
