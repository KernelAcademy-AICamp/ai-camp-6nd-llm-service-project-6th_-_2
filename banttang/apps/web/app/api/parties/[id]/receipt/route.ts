import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

// 데모용 영수증 인증.
// 실제로는 CLOVA OCR + Claude 검증을 거치지만 여기선 입력값 그대로 신뢰.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();
    const body = (await req.json()) as {
      store_name: string;
      total_amount: number;
      paid_at?: string;
    };
    const { data: party } = await sb
      .from("parties")
      .select("id, status, max_participants")
      .eq("id", params.id)
      .maybeSingle();
    if (!party) return NextResponse.json({ error: "주문 없음" }, { status: 404 });

    const paidAt = body.paid_at ? new Date(body.paid_at) : new Date();
    const pricePerPerson = Math.ceil(body.total_amount / party.max_participants);

    const { data: receipt, error } = await sb
      .from("receipts")
      .insert({
        party_id: params.id,
        uploader_id: me.id,
        storage_path: `receipts/${params.id}/demo-${Date.now()}.jpg`, // 더미
        final_store_name: body.store_name,
        final_total_amount: body.total_amount,
        final_paid_at: paidAt.toISOString(),
        price_per_person: pricePerPerson,
        ocr_store_name: body.store_name,
        ocr_total_amount: body.total_amount,
        ocr_paid_at: paidAt.toISOString(),
        ocr_confidence: 0.95,
        ocr_raw: { demo: true, note: "스텁 OCR 응답" },
        shared_to_chat_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 채팅방에 receipt_card 메시지 추가
    const { data: room } = await sb
      .from("chat_rooms")
      .select("id")
      .eq("party_id", params.id)
      .maybeSingle();
    if (room) {
      await sb.from("chat_messages").insert({
        room_id: room.id,
        sender_id: me.id,
        type: "receipt_card",
        content: `${body.store_name} 영수증 인증 (총 ${body.total_amount.toLocaleString()}원)`,
        metadata: { receipt_id: receipt.id, amount: body.total_amount },
      });
    }

    // 참여자에게 알림
    const { data: members } = await sb
      .from("party_participants")
      .select("user_id")
      .eq("party_id", params.id)
      .eq("status", "approved");
    for (const m of members ?? []) {
      if (m.user_id === me.id) continue;
      await sb.from("notifications").insert({
        user_id: m.user_id,
        type: "receipt_uploaded",
        title: "영수증이 등록됐어요",
        body: `1인 ${pricePerPerson.toLocaleString()}원`,
        link_path: `/chat/${params.id}`,
        related_party_id: params.id,
      });
    }

    return NextResponse.json({ ok: true, receipt_id: receipt.id, price_per_person: pricePerPerson });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
