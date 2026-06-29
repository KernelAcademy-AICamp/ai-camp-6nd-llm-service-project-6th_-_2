import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import {
  getSeedProducts,
  SEED_NEIGHBORHOOD_ID,
  SYSTEM_HOST_EMAIL,
  SYSTEM_HOST_NICKNAME,
  AI_PICK_MAX_MEMBERS,
} from "@/lib/grocery-picks.server";

// 관리자 전용 — AI 추천 방(0/2)을 재시드한다.
// 기존 AI 방을 모두 비우고 큐레이션 목록으로 다시 만든다(수동 재시드).
export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const admin = getServiceClient();

  // 1) 시스템 호스트(띵동 추천) find-or-create
  let hostId: string | null = null;
  // 이메일로 기존 유저 탐색
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  hostId =
    list?.users.find((u: { email?: string; id: string }) => u.email === SYSTEM_HOST_EMAIL)
      ?.id ?? null;
  if (!hostId) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: SYSTEM_HOST_EMAIL,
      password: `${crypto.randomUUID()}Aa1!`,
      email_confirm: true,
      user_metadata: { system: true, label: SYSTEM_HOST_NICKNAME },
    });
    if (cErr || !created?.user) {
      return NextResponse.json(
        { ok: false, error: `시스템 파티장 생성 실패: ${cErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    hostId = created.user.id;
  }

  // 2) 시스템 호스트 프로필 보장
  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: hostId,
      nickname: SYSTEM_HOST_NICKNAME,
      gender: "prefer_not_to_say",
      neighborhood_id: SEED_NEIGHBORHOOD_ID,
      is_beta_user: false,
    },
    { onConflict: "id" },
  );
  if (pErr) {
    return NextResponse.json(
      { ok: false, error: `프로필 생성 실패: ${pErr.message}` },
      { status: 500 },
    );
  }

  // 3) 픽업 장소 (시드 동네의 첫 픽업 장소 재사용)
  const { data: pickup } = await admin
    .from("pickup_locations")
    .select("id")
    .eq("neighborhood_id", SEED_NEIGHBORHOOD_ID)
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  const pickupLocationId = (pickup as { id?: string } | null)?.id ?? null;
  if (!pickupLocationId) {
    return NextResponse.json(
      { ok: false, error: "픽업 장소가 없어요. seed.sql 적용을 확인하세요." },
      { status: 500 },
    );
  }

  // 4) 스토어(네이버 쇼핑)에서 카테고리 상품 가져오기
  const products = await getSeedProducts();
  if (products.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "스토어 상품을 가져오지 못했어요. 네이버 API 키(NAVER_CLIENT_ID/SECRET) 설정을 확인하세요.",
      },
      { status: 502 },
    );
  }

  // 5) 기존 AI 방 비우기 (참여자는 FK CASCADE로 함께 삭제)
  const { error: delErr } = await admin
    .from("parties")
    .delete()
    .eq("is_ai_pick", true);
  if (delErr) {
    return NextResponse.json(
      { ok: false, error: `기존 방 삭제 실패: ${delErr.message}` },
      { status: 500 },
    );
  }

  // 6) 가져온 상품으로 방 생성 — 호스트는 참여자로 넣지 않아 0/2 유지
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const rows = products.map((item, i) => {
    const dealAt = new Date(now + (1 + i * 0.5) * DAY);
    const applyDeadlineAt = new Date(dealAt.getTime() - 60 * 60 * 1000);
    return {
      host_id: hostId,
      neighborhood_id: SEED_NEIGHBORHOOD_ID,
      category: "offline_shopping" as const,
      store_name: item.title,
      representative_menu: null,
      max_participants: AI_PICK_MAX_MEMBERS,
      price_per_person: item.pricePerPerson,
      deal_at: dealAt.toISOString(),
      apply_deadline_at: applyDeadlineAt.toISOString(),
      approval_type: "auto" as const,
      gender_option: "all" as const,
      pickup_location_id: pickupLocationId,
      paid_by_host: true,
      status: "recruiting" as const,
      is_ai_pick: true,
      pick_group: item.group,
      external_image_url: item.image,
    };
  });

  const { data: inserted, error: insErr } = await admin
    .from("parties")
    .insert(rows)
    .select("id");
  if (insErr) {
    return NextResponse.json(
      { ok: false, error: `방 생성 실패: ${insErr.message}` },
      { status: 500 },
    );
  }

  // 7) 트리거(on_party_created)가 자동 등록한 호스트 참여자 제거 → 0/2 유지.
  //    시스템 호스트는 실제 거래자가 아니라 방을 연 라벨일 뿐. 이웃 2명이 정원을 채운다.
  const newIds = ((inserted ?? []) as { id: string }[]).map((r) => r.id);
  if (newIds.length > 0) {
    await admin
      .from("party_participants")
      .delete()
      .in("party_id", newIds)
      .eq("is_host", true);
  }

  return NextResponse.json({ ok: true, created: inserted?.length ?? 0 });
}
