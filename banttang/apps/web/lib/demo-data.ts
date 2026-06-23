// 데모 데이터 — 실제 DB 데이터가 0건일 때 피드/지도가 텅 비지 않도록 UI에 끼워 넣는 가짜 카드.
// 클라이언트 사이드에서만 사용. id는 모두 "demo-" 접두사라 라우터/조인 시 식별 가능.

import type { DisplayStatus, PartyRow } from "./types";
import type { PickGroup, PickRoom } from "./grocery-picks";

export type FeedParty = PartyRow & {
  occupied_count: number;
  display_status: DisplayStatus;
  pickup_name: string | null;
  lat: number | null;
  lng: number | null;
  /** 짭 카테고리 — 데모 카드에만 박는다. 없으면 지도 칩에서 "기타"로 분류됨. */
  pick_group?: PickGroup | null;
  /** 반띵 희망 시간대(자유 텍스트). 없으면 deal_at에서 파생. */
  time_window?: string | null;
};

type Blueprint = {
  id: string;
  category: PartyRow["category"];
  store_name: string;
  representative_menu: string | null;
  max_participants: number;
  occupied_count: number;
  price_per_person: number;
  hours_from_now: number;
  pickup_name: string;
  // 사용자 위치 기준 오프셋 (도 단위). 약 1km 이내로 흩어둠 (위도 0.009 ≈ 1km).
  offset_lat: number;
  offset_lng: number;
  // 짭 분류(건강식품/과일·계란/홈케어) — 지도 칩 필터링용. 미지정은 "기타"로 분류.
  pick_group?: PickGroup;
  // 반띵 희망 시간대 — 자유 텍스트. 짭의 timeWindow와 동일 컨셉
  // (요일대 + 시간대 + 선택 정밀도 + 비고). 예: "평일 저녁 7~9시", "주말 오전 (재택)".
  time_window?: string;
};

// 카테고리별 3건씩 = 9건. 사용자 위치 기준 ±1km 안에 흩어보이게 오프셋 사용.
const BLUEPRINTS: Blueprint[] = [
  // 건강식품 (3건)
  {
    id: "demo-party-chicken",
    category: "offline_shopping",
    store_name: "롯데마트 — 허닭 닭가슴살 60팩",
    representative_menu: "닭가슴살 60팩 묶음 (4인 15팩씩)",
    max_participants: 4,
    occupied_count: 3,
    price_per_person: 12000,
    hours_from_now: 30,
    pickup_name: "동네 공원 정문",
    offset_lat: -0.0050,
    offset_lng: -0.0035,
    pick_group: "health",
    time_window: "평일 저녁 7~9시",
  },
  {
    id: "demo-party-salad",
    category: "online_shopping",
    store_name: "마켓컬리 — 샐러디 정기 패키지",
    representative_menu: "샐러드 5팩 (2인 분담)",
    max_participants: 2,
    occupied_count: 1,
    price_per_person: 14500,
    hours_from_now: 27,
    pickup_name: "근처 GS25",
    offset_lat: 0.0024,
    offset_lng: -0.0048,
    pick_group: "health",
    time_window: "평일 점심 12시",
  },
  {
    id: "demo-party-dietbox",
    category: "online_shopping",
    store_name: "오뚜기맘마 — 다이어트 도시락 10식",
    representative_menu: "10식 (2인이 5식씩)",
    max_participants: 2,
    occupied_count: 1,
    price_per_person: 18000,
    hours_from_now: 12,
    pickup_name: "근처 카페 앞",
    offset_lat: 0.0035,
    offset_lng: -0.0024,
    pick_group: "health",
    time_window: "평일 저녁 8~10시",
  },

  // 과일·계란 (3건)
  {
    id: "demo-party-eggs",
    category: "offline_shopping",
    store_name: "이마트24 — 동물복지 계란",
    representative_menu: "계란 30구 1판 (2인이 절반씩)",
    max_participants: 2,
    occupied_count: 1,
    price_per_person: 6500,
    hours_from_now: 8,
    pickup_name: "단지 후문 편의점",
    offset_lat: -0.0018,
    offset_lng: -0.0020,
    pick_group: "fruitegg",
    time_window: "주말 오전",
  },
  {
    id: "demo-party-apple",
    category: "offline_shopping",
    store_name: "홈플러스 — 사과 5kg",
    representative_menu: "사과 5kg 박스 (4인 분담)",
    max_participants: 4,
    occupied_count: 2,
    price_per_person: 7000,
    hours_from_now: 28,
    pickup_name: "근처 우체국 앞",
    offset_lat: 0.0048,
    offset_lng: 0.0040,
    pick_group: "fruitegg",
    time_window: "주말 오후 2~4시",
  },
  {
    id: "demo-party-strawberry",
    category: "offline_shopping",
    store_name: "농가직송 — 설향 딸기 4팩",
    representative_menu: "4팩 (4인 1팩씩)",
    max_participants: 4,
    occupied_count: 2,
    price_per_person: 8500,
    hours_from_now: 18,
    pickup_name: "단지 정문 편의점",
    offset_lat: 0.0012,
    offset_lng: 0.0009,
    pick_group: "fruitegg",
    time_window: "토요일 오전 10~12시",
  },

  // 1인 홈케어 공구 (3건)
  {
    id: "demo-party-water",
    category: "online_shopping",
    store_name: "쿠팡 로켓 — 백산수 2L x 24",
    representative_menu: "백산수 2L 24병 (2인 12병씩)",
    max_participants: 2,
    occupied_count: 1,
    price_per_person: 11500,
    hours_from_now: 6,
    pickup_name: "엘리베이터 앞 (택배 수령)",
    offset_lat: 0.0006,
    offset_lng: 0.0015,
    pick_group: "homecare",
    time_window: "평일 오전 (재택)",
  },
  {
    id: "demo-party-detergent",
    category: "online_shopping",
    store_name: "11번가 — 테크 세탁세제 4L",
    representative_menu: "세탁세제 4L x 2 (2인이 1개씩)",
    max_participants: 2,
    occupied_count: 1,
    price_per_person: 10500,
    hours_from_now: 50,
    pickup_name: "단지 관리실",
    offset_lat: -0.0044,
    offset_lng: 0.0026,
    pick_group: "homecare",
    time_window: "주말 오후",
  },
  {
    id: "demo-party-tissue",
    category: "offline_shopping",
    store_name: "코코 화장지 30롤",
    representative_menu: "30롤 (2인이 15롤씩)",
    max_participants: 2,
    occupied_count: 1,
    price_per_person: 9500,
    hours_from_now: 36,
    pickup_name: "근처 GS25",
    offset_lat: -0.0030,
    offset_lng: 0.0050,
    pick_group: "homecare",
    time_window: "평일 저녁",
  },

  // 기타 (3건) — 배달 위주, 짭 분류에 안 맞는 케이스
  {
    id: "demo-party-bhc",
    category: "delivery",
    store_name: "BHC 치킨",
    representative_menu: "뿌링클 + 콜라 1.25L",
    max_participants: 3,
    occupied_count: 1,
    price_per_person: 9800,
    hours_from_now: 3,
    pickup_name: "단지 후문 편의점",
    offset_lat: 0.0028,
    offset_lng: 0.0030,
    time_window: "평일 저녁 7시",
  },
  {
    id: "demo-party-moms",
    category: "delivery",
    store_name: "맘스터치 신림점",
    representative_menu: "싸이버거 세트 4인분",
    max_participants: 4,
    occupied_count: 2,
    price_per_person: 8500,
    hours_from_now: 5,
    pickup_name: "동네 도서관 앞",
    offset_lat: -0.0022,
    offset_lng: 0.0044,
    time_window: "평일 점심 12~1시",
  },
  {
    id: "demo-party-kyochon",
    category: "delivery",
    store_name: "교촌치킨",
    representative_menu: "허니콤보 + 무 + 콜라",
    max_participants: 3,
    occupied_count: 1,
    price_per_person: 11000,
    hours_from_now: 24,
    pickup_name: "엘리베이터 앞",
    offset_lat: -0.0014,
    offset_lng: -0.0050,
    time_window: "주말 저녁",
  },
];

// 신림 좌표를 폴백 기준점으로 사용
const FALLBACK_LAT = 37.4842;
const FALLBACK_LNG = 126.9296;

export function buildDemoFeedParties(
  baseLat: number | null,
  baseLng: number | null,
): FeedParty[] {
  const lat0 = baseLat ?? FALLBACK_LAT;
  const lng0 = baseLng ?? FALLBACK_LNG;
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  return BLUEPRINTS.map((b) => {
    const dealAt = new Date(now + b.hours_from_now * HOUR);
    const applyDeadlineAt = new Date(dealAt.getTime() - 60 * 60 * 1000);
    return {
      id: b.id,
      host_id: "demo-host",
      host_nickname: "데모호스트",
      host_level: "tree",
      host_transaction_count: 12,
      category: b.category,
      store_name: b.store_name,
      representative_menu: b.representative_menu,
      max_participants: b.max_participants,
      price_per_person: b.price_per_person,
      deal_at: dealAt.toISOString(),
      apply_deadline_at: applyDeadlineAt.toISOString(),
      pickup_location_id: null,
      custom_pickup_name: b.pickup_name,
      gender_option: "all",
      status: "recruiting",
      approved_count: b.occupied_count,
      slots_left: b.max_participants - b.occupied_count,
      created_at: new Date(now - 30 * 60 * 1000).toISOString(),
      photo_paths: null,
      occupied_count: b.occupied_count,
      display_status: "recruiting",
      pickup_name: b.pickup_name,
      lat: lat0 + b.offset_lat,
      lng: lng0 + b.offset_lng,
      pick_group: b.pick_group ?? null,
      time_window: b.time_window ?? null,
    } satisfies FeedParty;
  });
}

// AI 추천 섹션 폴백 — 카테고리별 4건씩 (1인 가격 기준 6k~18k).
// id는 "demo-pick-" 접두사. RoomCard 클릭 시 실제 join API에 가지 않도록 호출부에서 가드.
const PICK_BLUEPRINTS: Array<{
  id: string;
  group: PickGroup;
  title: string;
  price: number;
}> = [
  // 건강식품
  { id: "demo-pick-h1", group: "health", title: "허닭 닭가슴살 60팩 묶음", price: 12000 },
  { id: "demo-pick-h2", group: "health", title: "샐러디 정기 패키지 5팩", price: 14500 },
  { id: "demo-pick-h3", group: "health", title: "오뚜기맘마 다이어트 도시락 10식", price: 18000 },
  { id: "demo-pick-h4", group: "health", title: "단백질 쉐이크 18입 박스", price: 16500 },
  // 과일·계란
  { id: "demo-pick-f1", group: "fruitegg", title: "동물복지 계란 30구 1판", price: 6500 },
  { id: "demo-pick-f2", group: "fruitegg", title: "농가직송 사과 5kg 박스", price: 7000 },
  { id: "demo-pick-f3", group: "fruitegg", title: "설향 딸기 4팩", price: 8500 },
  { id: "demo-pick-f4", group: "fruitegg", title: "샤인머스캣 2kg", price: 11000 },
  // 1인 홈케어 공구
  { id: "demo-pick-c1", group: "homecare", title: "코코 화장지 30롤", price: 9500 },
  { id: "demo-pick-c2", group: "homecare", title: "테크 세탁세제 4L", price: 10500 },
  { id: "demo-pick-c3", group: "homecare", title: "백산수 2L x 12병", price: 7500 },
  { id: "demo-pick-c4", group: "homecare", title: "퐁퐁 주방세제 1.5L 리필", price: 6800 },
];

const PICK_IMAGE_BY_GROUP: Record<PickGroup, string> = {
  health: "https://placehold.co/240x240/7fb069/ffffff?text=%F0%9F%8D%97",
  fruitegg: "https://placehold.co/240x240/f6c244/ffffff?text=%F0%9F%8D%8E",
  homecare: "https://placehold.co/240x240/64748b/ffffff?text=%F0%9F%A7%BC",
};

// 실제 picks를 기반으로, 그룹별 최대 N개가 되도록 데모 카드로 패딩한다.
// 실제 데이터가 그룹에 N개 있으면 데모 안 끼움.
export function padPickRooms(real: PickRoom[], perGroup: number): PickRoom[] {
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const out: PickRoom[] = [...real];
  const countByGroup: Record<PickGroup, number> = {
    health: 0,
    fruitegg: 0,
    homecare: 0,
  };
  for (const r of real) countByGroup[r.group] = (countByGroup[r.group] ?? 0) + 1;

  for (const b of PICK_BLUEPRINTS) {
    if (countByGroup[b.group] >= perGroup) continue;
    out.push({
      id: b.id,
      group: b.group,
      title: b.title,
      pricePerPerson: b.price,
      maxMembers: 2,
      occupied: 0,
      image: PICK_IMAGE_BY_GROUP[b.group],
      dealAt: new Date(now + 24 * HOUR).toISOString(),
    });
    countByGroup[b.group] += 1;
  }
  return out;
}

export function isDemoId(id: string): boolean {
  return id.startsWith("demo-");
}
