// 홈 "바로 반띵하기"(AI BETA) 추천 — 시스템 호스트가 미리 만든 반띵 방.
// 타입/메타(클라이언트 안전). 실제 DB 조회·시드는 grocery-picks.server.ts(서버 전용)에 둔다.

export type PickGroup = "health" | "fruitegg" | "homecare";

// 추천 섹션에 노출할 "방" (parties 행 1개 = 방 1개)
export type PickRoom = {
  id: string; // party id
  group: PickGroup;
  title: string; // store_name
  pricePerPerson: number; // 1인 가격
  maxMembers: number; // 그룹 정원 (고정 2)
  occupied: number; // 현재 참여 인원
  image: string; // 썸네일 (external_image_url)
  dealAt: string; // 거래 예정 일시 (ISO)
  /** 관리자 큐레이션 상품 — true면 "핫딜" 뱃지가 붙고 정렬 시 위로 올라간다. */
  featured?: boolean;
  /** 1인이 받는 소분량 (예: "5팩", "1.5kg", "12병"). 카드 가격 옆 보조 표기. */
  perPersonUnit?: string;
};

// 소분류 칩 (전체 + 아래 3개)
export const PICK_GROUPS: { key: PickGroup; label: string; emoji: string }[] = [
  { key: "health", label: "건강식품", emoji: "🍗" },
  { key: "fruitegg", label: "과일·계란", emoji: "🍎" },
  { key: "homecare", label: "1인 홈케어 공구", emoji: "🧴" },
];
