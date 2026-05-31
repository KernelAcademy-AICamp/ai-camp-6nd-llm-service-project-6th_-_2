// PATCH /api/parties/[id]
// 호스트만, recruiting 또는 closed 상태에서 수정 가능.
// in_progress(영수증 인증 후) / completed / cancelled 는 잠금.
// 편집 가능 필드:
//   - store_name, representative_menu, price_per_person, deal_at (텍스트/숫자/시간)
//   - max_participants (현재 occupied 미만으로는 못 내림)
//   - gender_option ('all' | 'same_gender')
// 그 외(category, pickup, photos)는 별도 흐름으로:
//   - photos: upload-party-photos / delete-party-photo server action
//   - pickup: update-party-pickup (호스트 픽업 변경)
//   - category: 잠금 (변경 필요 시 삭제 후 재생성)

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();

    const { data: party, error: pErr } = await sb
      .from("parties")
      .select("id, host_id, status, apply_deadline_at, deal_at")
      .eq("id", params.id)
      .maybeSingle();
    if (pErr || !party) {
      return NextResponse.json({ error: "주문을 찾을 수 없어요." }, { status: 404 });
    }
    if (party.host_id !== me.id) {
      return NextResponse.json({ error: "호스트만 수정할 수 있어요." }, { status: 403 });
    }
    if (party.status !== "recruiting" && party.status !== "closed") {
      return NextResponse.json(
        { error: "거래 시작 후엔 수정할 수 없어요." },
        { status: 400 },
      );
    }

    const body = (await req.json()) as {
      store_name?: string;
      representative_menu?: string | null;
      price_per_person?: number;
      deal_at?: string;
      max_participants?: number;
      gender_option?: "all" | "same_gender";
      // 픽업 변경 — 세 필드 모두 같이 전송. pickup_location_id는 null로 클리어.
      custom_pickup_name?: string;
      custom_pickup_lat?: number;
      custom_pickup_lng?: number;
    };

    const update: Record<string, unknown> = {};

    if (body.store_name !== undefined) {
      const v = body.store_name.trim();
      if (!v) return NextResponse.json({ error: "가게명이 비어있어요." }, { status: 400 });
      update.store_name = v;
    }

    if (body.representative_menu !== undefined) {
      const v = body.representative_menu?.trim() || null;
      update.representative_menu = v;
    }

    if (body.price_per_person !== undefined) {
      if (!Number.isInteger(body.price_per_person) || body.price_per_person < 0) {
        return NextResponse.json(
          { error: "1인 금액은 0 이상의 정수여야 해요." },
          { status: 400 },
        );
      }
      update.price_per_person = body.price_per_person;
    }

    if (body.deal_at !== undefined) {
      const newDealAt = new Date(body.deal_at);
      if (Number.isNaN(newDealAt.getTime())) {
        return NextResponse.json({ error: "거래 시각 형식이 잘못됐어요." }, { status: 400 });
      }
      // future_deal CHECK 회피: now 보다 미래여야 함. 신청 마감도 함께 갱신 (deal_at - 1h).
      if (newDealAt.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "거래 시각은 현재보다 미래여야 해요." },
          { status: 400 },
        );
      }
      update.deal_at = newDealAt.toISOString();
      update.apply_deadline_at = new Date(
        newDealAt.getTime() - 60 * 60 * 1000,
      ).toISOString();
    }

    if (body.max_participants !== undefined) {
      const mp = body.max_participants;
      if (!Number.isInteger(mp) || mp < 2 || mp > 4) {
        return NextResponse.json(
          { error: "인원은 2~4명 사이여야 해요." },
          { status: 400 },
        );
      }
      // 현재 occupied (approved + pending) 이상이어야 함 — 이미 자리잡은 멤버를 못 내쫓음
      const { count: occupied } = await sb
        .from("party_participants")
        .select("id", { count: "exact", head: true })
        .eq("party_id", params.id)
        .in("status", ["approved", "pending"]);
      if (typeof occupied === "number" && mp < occupied) {
        return NextResponse.json(
          { error: `이미 ${occupied}명이 모였어요. 인원을 더 낮출 수 없어요.` },
          { status: 400 },
        );
      }
      update.max_participants = mp;
    }

    if (body.gender_option !== undefined) {
      if (body.gender_option !== "all" && body.gender_option !== "same_gender") {
        return NextResponse.json(
          { error: "성별 옵션이 잘못됐어요." },
          { status: 400 },
        );
      }
      update.gender_option = body.gender_option;
    }

    // 픽업 변경 — 세 필드 모두 있어야 처리. pickup_location_id는 null로 클리어해서 custom_pickup이 우선.
    if (
      body.custom_pickup_name !== undefined &&
      typeof body.custom_pickup_lat === "number" &&
      typeof body.custom_pickup_lng === "number"
    ) {
      const pname = body.custom_pickup_name.trim();
      if (!pname) {
        return NextResponse.json({ error: "픽업 장소명이 비어있어요." }, { status: 400 });
      }
      update.custom_pickup_name = pname;
      // PostGIS WKT — (lng lat) 순서
      update.custom_pickup_point = `SRID=4326;POINT(${body.custom_pickup_lng} ${body.custom_pickup_lat})`;
      update.pickup_location_id = null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, id: party.id, updated: 0 });
    }

    const { error: uErr } = await sb
      .from("parties")
      .update(update)
      .eq("id", params.id)
      .eq("host_id", me.id)
      .in("status", ["recruiting", "closed"]);
    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: party.id, updated: Object.keys(update).length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "수정 실패" }, { status: 500 });
  }
}
