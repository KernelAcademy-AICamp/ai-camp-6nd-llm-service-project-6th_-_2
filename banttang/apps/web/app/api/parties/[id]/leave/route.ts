import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

// 파티원이 나가기 / 호스트가 파티원 내보내기
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();
    const body = (await req.json().catch(() => ({}))) as { targetUserId?: string };
    const targetUserId = body.targetUserId ?? me.id;

    const { data: party } = await sb
      .from("parties")
      .select("id, host_id, status, max_participants")
      .eq("id", params.id)
      .maybeSingle();
    if (!party) return NextResponse.json({ error: "주문 없음" }, { status: 404 });

    // 권한: 본인 나가기 OR 호스트가 내보내기
    if (targetUserId !== me.id && party.host_id !== me.id) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    // 호스트 본인은 leave 금지 (취소를 써야 함)
    if (targetUserId === party.host_id)
      return NextResponse.json({ error: "호스트는 주문 취소 사용" }, { status: 400 });

    const { error } = await sb
      .from("party_participants")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("party_id", params.id)
      .eq("user_id", targetUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 만약 채팅방이 열려 있었다면 시스템 메시지 + 인원수정 권한 부여 안내
    const { data: room } = await sb
      .from("chat_rooms")
      .select("id")
      .eq("party_id", params.id)
      .maybeSingle();
    if (room) {
      const { data: profile } = await sb
        .from("profiles")
        .select("nickname")
        .eq("id", targetUserId)
        .maybeSingle();
      // 호스트가 내보낸 경우(강퇴)와 본인 나가기를 문구·kind로 구분.
      const kicked = targetUserId !== me.id;
      const nick = profile?.nickname ?? "파티원";
      await sb.from("chat_messages").insert({
        room_id: room.id,
        type: "system",
        system_event: "member_left",
        content: kicked
          ? `${nick} 님이 내보내졌어요.`
          : `${nick} 님이 채팅방을 나갔어요.`,
        metadata: { kind: kicked ? "member_kicked" : "member_left" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
