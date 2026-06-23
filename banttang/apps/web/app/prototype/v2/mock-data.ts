// 프로토타입 v2 목업 데이터.
// 실제 DB 연결 X. UI 흐름 확정용 더미.

export type Category = {
  // "etc"는 큐레이션 외 상품용. CATEGORIES 배열엔 포함하지 않고 (AI 칩에 노출되지 않게)
  // 지도 섹션 칩에서만 별도로 렌더한다.
  id: "health" | "fruit" | "homecare" | "etc";
  emoji: string;
  label: string;
  desc: string;
};

export type Product = {
  id: string;
  categoryId: Category["id"];
  thumbnail: string; // emoji
  brand?: string;
  name: string;
  unit: string; // "60팩", "30구 1판" 등
  pricePerPerson: number;
  groupSize: number; // 목표 인원
};

export type Participation = {
  id: string;
  productId: string;
  nickname: string;
  trustLevel: 1 | 2 | 3; // 신뢰점수 ⭐
  lat: number;
  lng: number;
  pickupName: string;
  timeWindow: string; // "평일 저녁" 등
  joinedAtRel: string; // "5분 전" 같은 상대 시간
};

export const CATEGORIES: Category[] = [
  {
    id: "health",
    emoji: "🥩",
    label: "건강식품",
    desc: "닭가슴살, 샐러드, 다이어트 도시락",
  },
  {
    id: "fruit",
    emoji: "🍎",
    label: "과일·계란",
    desc: "제철 과일, 계란 한 판",
  },
  {
    id: "homecare",
    emoji: "🧹",
    label: "1인 홈케어 공구",
    desc: "창틀·욕실·에어컨 등 1인이 부르기 부담스러운 서비스",
  },
];

// "기타" — 큐레이션 외 상품을 사용자가 직접 등록한 경우의 노출 칸.
// AI 추천 칩에는 노출되지 않고, 지도 섹션 칩에만 표시.
export const ETC_CATEGORY: Category = {
  id: "etc",
  emoji: "🧺",
  label: "기타",
  desc: "큐레이션 외 — 자취·캠핑·문구 등 자유 주문",
};

export const PRODUCTS: Product[] = [
  // 건강식품
  {
    id: "p_chicken60",
    categoryId: "health",
    thumbnail: "🍗",
    brand: "허닭",
    name: "닭가슴살 60팩 묶음",
    unit: "60팩 (4인 기준 15팩씩)",
    pricePerPerson: 12000,
    groupSize: 4,
  },
  {
    id: "p_salad_pack",
    categoryId: "health",
    thumbnail: "🥗",
    brand: "샐러디",
    name: "샐러드 정기 패키지",
    unit: "5팩 (2인 기준 + 배송비 분담)",
    pricePerPerson: 14500,
    groupSize: 2,
  },
  {
    id: "p_diet_box",
    categoryId: "health",
    thumbnail: "🍱",
    brand: "오뚜기맘마",
    name: "다이어트 도시락 10식",
    unit: "10식 (2인 기준 5식씩)",
    pricePerPerson: 18000,
    groupSize: 2,
  },

  // 과일·계란
  {
    id: "p_eggs",
    categoryId: "fruit",
    thumbnail: "🥚",
    name: "동물복지 계란 30구",
    unit: "30구 1판 (2인 기준 15구씩)",
    pricePerPerson: 6500,
    groupSize: 2,
  },
  {
    id: "p_apple",
    categoryId: "fruit",
    thumbnail: "🍎",
    brand: "농가직송",
    name: "사과 5kg 박스",
    unit: "5kg (4인 기준 1.25kg씩)",
    pricePerPerson: 7000,
    groupSize: 4,
  },
  {
    id: "p_strawberry",
    categoryId: "fruit",
    thumbnail: "🍓",
    name: "설향 딸기 4팩",
    unit: "4팩 (4인 기준 1팩씩)",
    pricePerPerson: 8500,
    groupSize: 4,
  },

  // 1인 홈케어 공구
  {
    id: "p_aircon_clean",
    categoryId: "homecare",
    thumbnail: "❄️",
    name: "에어컨 분해 청소",
    unit: "방문 1회 (출장비 4인 분담)",
    pricePerPerson: 22000,
    groupSize: 4,
  },
  {
    id: "p_bathroom_clean",
    categoryId: "homecare",
    thumbnail: "🛁",
    name: "욕실 곰팡이 제거·살균",
    unit: "방문 1회 (출장비 3인 분담)",
    pricePerPerson: 18000,
    groupSize: 3,
  },
  {
    id: "p_window",
    categoryId: "homecare",
    thumbnail: "🪟",
    name: "창틀·새시 청소",
    unit: "방문 1회 (출장비 4인 분담)",
    pricePerPerson: 12000,
    groupSize: 4,
  },

  // 기타 (큐레이션 외)
  {
    id: "p_camping_set",
    categoryId: "etc",
    thumbnail: "⛺",
    name: "캠핑 코펠·식기 5인 세트",
    unit: "1세트 (3인 분담)",
    pricePerPerson: 25000,
    groupSize: 3,
  },
  {
    id: "p_humidifier",
    categoryId: "etc",
    thumbnail: "💧",
    name: "초음파 가습기 2대 패키지",
    unit: "2대 (2인이 1대씩)",
    pricePerPerson: 18000,
    groupSize: 2,
  },
];

// 참여자 핀 — 모든 좌표는 신림역(37.4842, 126.9293) 주변 1km 반경에 흩어둠.
// 실제로는 사용자가 직접 지정한 좌표를 그대로 쓰는 그림이지만,
// 홈케어는 거주지 노출 우려가 있어 약간 흐릿하게 두는 컨셉 (시각적으로는 똑같이 표시).
export const PARTICIPATIONS: Participation[] = [
  // 닭가슴살 60팩 — 4명 그룹, 현재 3명
  {
    id: "j_chk_1",
    productId: "p_chicken60",
    nickname: "지은이",
    trustLevel: 3,
    lat: 37.4843,
    lng: 126.9295,
    pickupName: "신림역 3번 출구",
    timeWindow: "평일 저녁 7~9시",
    joinedAtRel: "5분 전",
  },
  {
    id: "j_chk_2",
    productId: "p_chicken60",
    nickname: "동현",
    trustLevel: 2,
    lat: 37.4865,
    lng: 126.9310,
    pickupName: "신림 도서관 앞",
    timeWindow: "주말 오전",
    joinedAtRel: "32분 전",
  },
  {
    id: "j_chk_3",
    productId: "p_chicken60",
    nickname: "민혁",
    trustLevel: 2,
    lat: 37.4825,
    lng: 126.9272,
    pickupName: "보라매공원 정문",
    timeWindow: "평일 저녁 8~10시",
    joinedAtRel: "1시간 전",
  },

  // 샐러드 정기 패키지 — 2명 그룹, 현재 1명
  {
    id: "j_sld_1",
    productId: "p_salad_pack",
    nickname: "수아",
    trustLevel: 3,
    lat: 37.4850,
    lng: 126.9285,
    pickupName: "GS25 신림역점",
    timeWindow: "평일 점심 12시",
    joinedAtRel: "12분 전",
  },

  // 계란 30구 — 2명 그룹, 현재 2명 (마감 임박)
  {
    id: "j_egg_1",
    productId: "p_eggs",
    nickname: "예지",
    trustLevel: 2,
    lat: 37.4838,
    lng: 126.9300,
    pickupName: "신림역 1번 출구",
    timeWindow: "주말 오전",
    joinedAtRel: "방금 전",
  },
  {
    id: "j_egg_2",
    productId: "p_eggs",
    nickname: "유나",
    trustLevel: 3,
    lat: 37.4820,
    lng: 126.9280,
    pickupName: "관악산 입구 편의점",
    timeWindow: "주말 오전 10~11시",
    joinedAtRel: "15분 전",
  },

  // 사과 5kg — 4명 그룹, 현재 2명
  {
    id: "j_apl_1",
    productId: "p_apple",
    nickname: "성우",
    trustLevel: 3,
    lat: 37.4848,
    lng: 126.9290,
    pickupName: "신림역 4번 출구",
    timeWindow: "주말 오후",
    joinedAtRel: "20분 전",
  },
  {
    id: "j_apl_2",
    productId: "p_apple",
    nickname: "다은",
    trustLevel: 2,
    lat: 37.4860,
    lng: 126.9315,
    pickupName: "신림 우체국 앞",
    timeWindow: "주말 오후 2~4시",
    joinedAtRel: "40분 전",
  },

  // 에어컨 청소 — 4명 그룹, 현재 2명
  {
    id: "j_ac_1",
    productId: "p_aircon_clean",
    nickname: "지훈",
    trustLevel: 2,
    lat: 37.4830,
    lng: 126.9298,
    pickupName: "신림동 1620 일대 (정확한 주소는 매칭 후 공개)",
    timeWindow: "토요일 오전",
    joinedAtRel: "1시간 전",
  },
  {
    id: "j_ac_2",
    productId: "p_aircon_clean",
    nickname: "보람",
    trustLevel: 3,
    lat: 37.4855,
    lng: 126.9305,
    pickupName: "신림동 1635 일대 (정확한 주소는 매칭 후 공개)",
    timeWindow: "토요일 오전 10~12시",
    joinedAtRel: "2시간 전",
  },

  // 욕실 곰팡이 — 3명 그룹, 현재 1명
  {
    id: "j_bth_1",
    productId: "p_bathroom_clean",
    nickname: "하늘",
    trustLevel: 2,
    lat: 37.4845,
    lng: 126.9270,
    pickupName: "신림동 1582 일대",
    timeWindow: "평일 오전 (재택)",
    joinedAtRel: "10분 전",
  },

  // 창틀 청소 — 4명 그룹, 현재 0명
  // (의도적으로 아무도 없음 → "첫 번째 참여자가 되어보세요" 상태 시연용)

  // 캠핑 코펠 세트 (기타)
  {
    id: "j_etc_1",
    productId: "p_camping_set",
    nickname: "지우",
    trustLevel: 2,
    lat: 37.4852,
    lng: 126.9278,
    pickupName: "신림역 5번 출구",
    timeWindow: "주말 오전",
    joinedAtRel: "25분 전",
  },
  // 가습기 (기타)
  {
    id: "j_etc_2",
    productId: "p_humidifier",
    nickname: "재훈",
    trustLevel: 3,
    lat: 37.4828,
    lng: 126.9305,
    pickupName: "신림 우체국 앞",
    timeWindow: "평일 저녁",
    joinedAtRel: "1시간 전",
  },
];

// ─────────────────── AI 추천 상품 슬롯 ───────────────────
// 별도 팀에서 개발 중인 "AI가 추천하는 반띵 호스팅" 기능의 UI 껍데기.
// 매칭된 사람을 보여주는 게 아니라, "이 상품 반띵 어때요?" 식의 상품 슬롯만 노출.
// 카테고리당 3~4건씩 두어 "전체"에서 페이지네이션이 의미 있게 동작하게 함.

export type AIPick = {
  id: string;
  productId: string;
  reason: string; // AI가 이 상품을 추천한 이유 (개인화 카피)
  signal?: string; // 보조 신호 (예: "이번 주 3명 검색")
};

export const AI_PICKS: AIPick[] = [
  // 건강식품 4건
  {
    id: "ai_h1",
    productId: "p_chicken60",
    reason: "단백질 식단 선호 패턴",
    signal: "이번 주 12명 검색",
  },
  {
    id: "ai_h2",
    productId: "p_salad_pack",
    reason: "최근 검색한 상품",
    signal: "동네 인기 상승 ↑",
  },
  {
    id: "ai_h3",
    productId: "p_diet_box",
    reason: "1인 가구 추천",
    signal: "주말 수요 많음",
  },
  {
    id: "ai_h4",
    productId: "p_chicken60",
    reason: "재구매 가능성 높음",
  },

  // 과일·계란 3건
  {
    id: "ai_f1",
    productId: "p_eggs",
    reason: "주 1회 구매 패턴",
    signal: "신선식품 인기",
  },
  {
    id: "ai_f2",
    productId: "p_apple",
    reason: "동네 평균 단가 -18%",
    signal: "농가직송 신상",
  },
  {
    id: "ai_f3",
    productId: "p_strawberry",
    reason: "제철 추천",
    signal: "한정 수량",
  },

  // 1인 홈케어 공구 3건
  {
    id: "ai_c1",
    productId: "p_aircon_clean",
    reason: "여름철 수요 급증",
    signal: "출장비 4인 분담 시 절감",
  },
  {
    id: "ai_c2",
    productId: "p_bathroom_clean",
    reason: "원룸형 신청 다수",
    signal: "이번 주 신청 ↑",
  },
  {
    id: "ai_c3",
    productId: "p_window",
    reason: "환절기 추천",
  },
];

// 헬퍼: 상품 → 참여 핀들
export function getParticipations(productId: string): Participation[] {
  return PARTICIPATIONS.filter((p) => p.productId === productId);
}

// 헬퍼: 카테고리 → 상품들
export function getProductsByCategory(categoryId: Category["id"]): Product[] {
  return PRODUCTS.filter((p) => p.categoryId === categoryId);
}

// 헬퍼: 신뢰 등급 → 이모지/라벨
export function trustLabel(level: 1 | 2 | 3): string {
  if (level === 3) return "⭐⭐⭐ 든든";
  if (level === 2) return "⭐⭐ 신뢰";
  return "⭐ 새내기";
}
