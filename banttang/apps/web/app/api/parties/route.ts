import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const me = await requireCurrentUser();
    const sb = getServiceClient();
    const body = (await req.json()) as {
      category: "delivery" | "offline_shopping" | "online_shopping";
      store_name: string;
      representative_menu?: string;
      max_participants: number;
      price_per_person: number;
      pickup_location_id?: string;
      custom_pickup_name?: string;
      custom_pickup_lat?: number;
      custom_pickup_lng?: number;
      deal_at: string;
      gender_option: "all" | "same_gender";
    };

    const dealAt = new Date(body.deal_at);
    const applyDeadline = new Date(dealAt.getTime() - 60 * 60 * 1000);

    const { data: nb } = await sb
      .from("neighborhoods")
      .select("id")
      .eq("name", "신림동")
      .maybeSingle();
    if (!nb) return NextResponse.json({ error: "베타 동네 시드 없음" }, { status: 500 });

    const insertRow: Record<string, unknown> = {
      host_id: me.id,
      neighborhood_id: nb.id,
      category: body.category,
      store_name: body.store_name,
      representative_menu: body.representative_menu ?? null,
      max_participants: body.max_participants,
      price_per_person: body.price_per_person,
      deal_at: dealAt.toISOString(),
      apply_deadline_at: applyDeadline.toISOString(),
      approval_type: "manual",
      gender_option: body.gender_option,
    };

    if (body.pickup_location_id) {
      insertRow.pickup_location_id = body.pickup_location_id;
    } else if (
      body.custom_pickup_name &&
      typeof body.custom_pickup_lat === "number" &&
      typeof body.custom_pickup_lng === "number"
    ) {
      insertRow.custom_pickup_name = body.custom_pickup_name;
      // PostGIS WKT — (lng lat) 순서임에 주의
      insertRow.custom_pickup_point = `SRID=4326;POINT(${body.custom_pickup_lng} ${body.custom_pickup_lat})`;
    } else {
      return NextResponse.json(
        { error: "픽업 장소 정보 누락 (pickup_location_id 또는 custom_pickup_*)" },
        { status: 400 },
      );
    }

    const { data, error } = await sb.from("parties").insert(insertRow).select("id").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
