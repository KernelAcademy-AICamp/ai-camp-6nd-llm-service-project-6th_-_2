import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();

    const { data: party, error: pe } = await sb
      .from("parties")
      .select("id, host_id, max_participants, status, is_ai_pick")
      .eq("id", params.id)
      .maybeSingle();
    if (pe || !party) return NextResponse.json({ error: "주문 없음" }, { status: 404 });
    if (party.status !== "recruiting")
      return NextResponse.json({ error: "이미 마감된 주문" }, { status: 400 });
    if (party.host_id === me.id)
      return NextResponse.json({ error: "본인 주문에 참여 불가" }, { status: 400 });

    // 정원 체크 (approved + pending 합산)
    const { data: parts } = await sb
      .from("party_participants")
      .select("user_id, status")
      .eq("party_id", params.id);
    const occupied = (parts ?? []).filter(
      (p: any) => p.status === "approved" || p.status === "pending",
    );
    if (occupied.length >= (party.max_participants as number))
      return NextResponse.json({ error: "정원 마감" }, { status: 400 });
    if (occupied.some((p: any) => p.user_id === me.id))
      return NextResponse.json({ error: "이미 신청함" }, { status: 400 });

    // AI 추천 방은 호스트(시스템 계정)가 승인할 수 없으므로 자동 승인한다.
    // 정원이 차면 on_participant_approved 트리거가 마감 + 채팅방 오픈을 처리.
    const isAiPick = Boolean((party as { is_ai_pick?: boolean }).is_ai_pick);
    const { error: ie } = await sb.from("party_participants").insert({
      party_id: params.id,
      user_id: me.id,
      status: isAiPick ? "approved" : "pending",
      is_host: false,
      approved_at: isAiPick ? new Date().toISOString() : null,
    });
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 });

    // 일반 방: 호스트에게 인앱 알림 (정원이 다 찼을 때). AI 방은 호스트가 없어 생략.
    const newOccupied = occupied.length + 1;
    if (!isAiPick && newOccupied >= (party.max_participants as number)) {
      await sb.from("notifications").insert({
        user_id: party.host_id,
        type: "application_received",
        title: "파티원이 모두 모였어요",
        body: "주문을 진행할까요? 수락하면 채팅방이 열립니다.",
        link_path: `/feed/${params.id}`,
        related_party_id: params.id,
      });
    }

    return NextResponse.json({
      ok: true,
      waitingForHost: !isAiPick && newOccupied >= party.max_participants,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
