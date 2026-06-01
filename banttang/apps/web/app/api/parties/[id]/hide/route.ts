import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

// 진행완료(completed) / 취소(cancelled) 거래를 본인 목록에서만 숨김.
// 다른 멤버에겐 영향 없음 (real cancel/leave와 다름).
// recruiting/closed/in_progress는 본 라우트로 처리하지 않음 — cancel/leave 사용.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();

    const { data: party } = await sb
      .from("parties")
      .select("id, status")
      .eq("id", params.id)
      .maybeSingle();
    if (!party) return NextResponse.json({ error: "주문 없음" }, { status: 404 });

    if (party.status !== "completed" && party.status !== "cancelled") {
      return NextResponse.json(
        { error: "완료·취소된 주문만 숨길 수 있어요" },
        { status: 400 },
      );
    }

    const { error } = await sb
      .from("party_participants")
      .update({ hidden_at: new Date().toISOString() })
      .eq("party_id", params.id)
      .eq("user_id", me.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
