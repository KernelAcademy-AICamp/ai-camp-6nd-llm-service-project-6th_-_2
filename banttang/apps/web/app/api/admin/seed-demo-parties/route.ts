import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import {
  SEED_NEIGHBORHOOD_ID,
  SYSTEM_HOST_EMAIL,
  SYSTEM_HOST_NICKNAME,
} from "@/lib/grocery-picks.server";

// 관리자 전용 — 동네 주문 데모 데이터 시드.
// 카테고리별 2~4건씩 모집중(0/N) 주문을 만든다. is_ai_pick=false 라 일반 피드/지도에 노출.
// 각 주문은 신림 근방 좌표를 custom_pickup_point에 직접 박아 지도에 흩어보이게 함.

type DemoCategory = "delivery" | "offline_shopping" | "online_shopping";

type DemoParty = {
  category: DemoCategory;
  store_name: string;
  representative_menu: string | null;
  max_participants: number;
  price_per_person: number;
  hours_from_now: number;
  pickup_name: string;
  lat: number;
  lng: number;
};

// 신림역 (37.4842, 126.9293) 주변 1km 이내 좌표로 흩뿌림.
const DEMO_PARTIES: DemoParty[] = [
  // 배달 (3건)
  {
    category: "delivery",
    store_name: "배달의민족 BHC 치킨",
    representative_menu: "뿌링클 + 콜라 1.25L",
    max_participants: 3,
    price_per_person: 9800,
    hours_from_now: 3,
    pickup_name: "신림역 2번 출구 앞",
    lat: 37.4845,
    lng: 126.9290,
  },
  {
    category: "delivery",
    store_name: "맘스터치 신림점",
    representative_menu: "싸이버거 세트 4인분",
    max_participants: 4,
    price_per_person: 8500,
    hours_from_now: 5,
    pickup_name: "신림 도서관 앞",
    lat: 37.4868,
    lng: 126.9312,
  },
  {
    category: "delivery",
    store_name: "교촌치킨 신림역점",
    representative_menu: "허니콤보 + 무 + 콜라",
    max_participants: 3,
    price_per_person: 11000,
    hours_from_now: 24,
    pickup_name: "보라매공원 정문",
    lat: 37.4825,
    lng: 126.9270,
  },

  // 장보기 (3건)
  {
    category: "offline_shopping",
    store_name: "이마트24 신림역점 — 동물복지 계란",
    representative_menu: "계란 30구 1판 (절반씩)",
    max_participants: 2,
    price_per_person: 6500,
    hours_from_now: 8,
    pickup_name: "신림역 1번 출구",
    lat: 37.4838,
    lng: 126.9300,
  },
  {
    category: "offline_shopping",
    store_name: "홈플러스 익스프레스 — 사과 5kg",
    representative_menu: "사과 5kg 박스 (4인 분담)",
    max_participants: 4,
    price_per_person: 7000,
    hours_from_now: 28,
    pickup_name: "신림역 4번 출구",
    lat: 37.4848,
    lng: 126.9290,
  },
  {
    category: "offline_shopping",
    store_name: "롯데마트 신림점 — 닭가슴살 60팩",
    representative_menu: "허닭 닭가슴살 60팩 묶음",
    max_participants: 4,
    price_per_person: 12000,
    hours_from_now: 30,
    pickup_name: "관악산 입구 편의점",
    lat: 37.4820,
    lng: 126.9280,
  },

  // 온라인 (3건)
  {
    category: "online_shopping",
    store_name: "쿠팡 로켓 — 백산수 2L x 24",
    representative_menu: "백산수 2L 24병 (2인 12병씩)",
    max_participants: 2,
    price_per_person: 11500,
    hours_from_now: 6,
    pickup_name: "신림역 3번 출구",
    lat: 37.4843,
    lng: 126.9295,
  },
  {
    category: "online_shopping",
    store_name: "마켓컬리 — 샐러디 정기 패키지",
    representative_menu: "샐러드 5팩 (2인 분담)",
    max_participants: 2,
    price_per_person: 14500,
    hours_from_now: 27,
    pickup_name: "GS25 신림역점",
    lat: 37.4850,
    lng: 126.9285,
  },
  {
    category: "online_shopping",
    store_name: "11번가 — 테크 세탁세제 4L 2개",
    representative_menu: "세탁세제 4L x 2 (2인이 1개씩)",
    max_participants: 2,
    price_per_person: 10500,
    hours_from_now: 50,
    pickup_name: "신림 우체국 앞",
    lat: 37.4860,
    lng: 126.9315,
  },
];

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const admin = getServiceClient();

  // 1) 시스템 호스트 find-or-create (AI 시드와 동일 계정 재사용)
  let hostId: string | null = null;
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  hostId =
    list?.users.find(
      (u: { email?: string; id: string }) => u.email === SYSTEM_HOST_EMAIL,
    )?.id ?? null;
  if (!hostId) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: SYSTEM_HOST_EMAIL,
      password: `${crypto.randomUUID()}Aa1!`,
      email_confirm: true,
      user_metadata: { system: true, label: SYSTEM_HOST_NICKNAME },
    });
    if (cErr || !created?.user) {
      return NextResponse.json(
        { ok: false, error: `시스템 호스트 생성 실패: ${cErr?.message ?? "unknown"}` },
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

  // 3) 기존 데모 주문 비우기 — 시스템 호스트가 만든 비-AI 방만 삭제 (실제 유저 데이터는 건드리지 않음)
  const { error: delErr } = await admin
    .from("parties")
    .delete()
    .eq("host_id", hostId)
    .eq("is_ai_pick", false);
  if (delErr) {
    return NextResponse.json(
      { ok: false, error: `기존 데모 주문 삭제 실패: ${delErr.message}` },
      { status: 500 },
    );
  }

  // 4) 데모 주문 인서트
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const rows = DEMO_PARTIES.map((d) => {
    const dealAt = new Date(now + d.hours_from_now * HOUR);
    const applyDeadlineAt = new Date(dealAt.getTime() - 60 * 60 * 1000);
    return {
      host_id: hostId,
      neighborhood_id: SEED_NEIGHBORHOOD_ID,
      category: d.category,
      store_name: d.store_name,
      representative_menu: d.representative_menu,
      max_participants: d.max_participants,
      price_per_person: d.price_per_person,
      deal_at: dealAt.toISOString(),
      apply_deadline_at: applyDeadlineAt.toISOString(),
      approval_type: "auto" as const,
      gender_option: "all" as const,
      pickup_location_id: null,
      // PostGIS geography(POINT) — WKT 문자열로 전달 (Supabase가 파싱).
      custom_pickup_name: d.pickup_name,
      custom_pickup_point: `SRID=4326;POINT(${d.lng} ${d.lat})`,
      paid_by_host: false,
      status: "recruiting" as const,
      is_ai_pick: false,
    };
  });

  const { data: inserted, error: insErr } = await admin
    .from("parties")
    .insert(rows)
    .select("id");
  if (insErr) {
    return NextResponse.json(
      { ok: false, error: `데모 주문 생성 실패: ${insErr.message}` },
      { status: 500 },
    );
  }

  // 5) on_party_created 트리거가 호스트를 참여자로 넣었을 수 있어 제거 → 0/N 유지.
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
