// 플랫폼(띵동) 공동구매 상품 config.
// 상품 정보는 여기(코드)에 두고, 참여자만 DB(group_buy_participants)에 저장한다.
// 새 공구를 열려면 이 배열에 항목을 추가하면 된다.

export type GroupBuyOption = {
  label: string; // "1.6kg (10~16과)"
  retailPrice: number; // 시중 정가
  groupPrice: number; // 공구가
};

export type BankAccount = {
  bank: string; // "카카오뱅크"
  number: string; // "3333-00-0000000"
  holder: string; // "(주)띵동"
};

export type GroupBuy = {
  slug: string;
  // 추천 개인화(신호 4)용 카테고리 value — personalize.ts CATEGORY_INFO 키와 동일.
  // 예: 'fruit' | 'meat' | 'tissue'. slug→품목 매핑을 config 한 곳에서.
  categoryValue: string;
  title: string;
  subtitle: string; // 한 줄 소개
  emoji: string; // 동네핫딜 칩 썸네일용
  dealType: "공구" | "핫딜"; // 동네핫딜 칩 뱃지
  productUrl: string; // 원 상품 링크(참고)
  origin: string; // 원산지/판매처
  bankAccount: BankAccount; // 입금 계좌 (챗봇 안내용)
  options: GroupBuyOption[];
  unitNote: string; // "1박스 기준" 등
  targetCount: number; // 목표 참여 인원 (공동구매 규모)
  currentCount: number; // 현재까지 모집된 인원 — 데모용 의사난수. 지도 핀/칩에 진행률 표기.
  deadlineAt: string; // 신청 마감 (ISO)
  shipFrom: string; // 발송 안내
  highlights: string[]; // 포인트 3~5개
  description: string; // 상세 설명(여러 줄)
  // "우리동네 반띵 보기" 지도에 핀으로 표시할 좌표. 동네 핫딜은 판매처/픽업 위치 기준.
  lat: number;
  lng: number;
  // 지도 핀에 노출할 픽업 위치명(가게/장소)
  pickupName: string;
};

export const GROUP_BUYS: GroupBuy[] = [
  {
    slug: "sinbi-peach",
    categoryValue: "fruit",
    title: "노지 신비복숭아",
    subtitle: "천도와 백도의 만남, 새콤달콤 여름 복숭아",
    emoji: "🍑",
    dealType: "공구",
    productUrl:
      "https://www.onbrix.co.kr/shop/product/product_view?product_cd=P23051000448",
    origin: "국내산 노지 재배",
    bankAccount: {
      bank: "카카오뱅크",
      number: "3333-00-0000000",
      holder: "(주)띵동",
    },
    options: [
      { label: "1.6kg (10~16과)", retailPrice: 27900, groupPrice: 21900 },
      { label: "3.2kg (20~32과)", retailPrice: 51900, groupPrice: 41900 },
    ],
    unitNote: "박스 단위 · 가정용",
    targetCount: 100,
    currentCount: 47,
    deadlineAt: "2026-06-17T14:59:00+09:00",
    shipFrom: "6월 15일부터 순차 발송",
    highlights: [
      "천도복숭아의 새콤함 + 백도의 달콤함을 한 번에",
      "노지에서 햇빛 받고 자란 제철 복숭아",
      "공구가로 시중 대비 최대 약 20% 저렴하게",
      "목표 인원 달성 시 일괄 발송",
    ],
    description:
      "천도와 백도를 교배한 신품종 '신비복숭아'예요. 천도처럼 단단하면서도 백도의 달콤한 향이 살아있어 여름 제철 과일로 인기가 많아요.\n\n띵동이 산지와 직접 연결해 공동구매로 열었어요. 혼자 한 박스 사기엔 부담스러운 양도, 이웃들과 함께라면 합리적인 가격에 받아볼 수 있어요.\n\n신청 마감 후 목표 인원이 모이면 산지에서 6월 15일부터 순차적으로 발송됩니다.",
    lat: 37.4848,
    lng: 126.9305,
    pickupName: "신림역 4번 출구",
  },
  {
    slug: "hanwoo-jeongol",
    categoryValue: "meat",
    title: "한돈 생삼겹살 1+1",
    subtitle: "동네 정육점 사장님 직접 공급, 당일 손질",
    emoji: "🥩",
    dealType: "핫딜",
    productUrl: "https://example.com",
    origin: "국내산 한돈",
    bankAccount: {
      bank: "카카오뱅크",
      number: "3333-00-0000000",
      holder: "(주)띵동",
    },
    options: [
      { label: "500g x 2팩", retailPrice: 24000, groupPrice: 16900 },
      { label: "1kg x 2팩", retailPrice: 46000, groupPrice: 32900 },
    ],
    unitNote: "진공 포장 · 냉장",
    targetCount: 80,
    currentCount: 23,
    deadlineAt: "2026-06-20T14:59:00+09:00",
    shipFrom: "마감 다음 날 동네 정육점에서 픽업",
    highlights: [
      "동네 정육점 사장님이 직접 손질해 공급",
      "1+1 핫딜가로 시중 대비 약 28% 저렴",
      "주문 당일 손질해 신선하게",
      "목표 인원 달성 시 일괄 준비",
    ],
    description:
      "동네 정육점 사장님이 띵동에 직접 올린 한돈 생삼겹살 핫딜이에요. 1인 가구가 사기엔 양이 부담스러운 삼겹살을 이웃들과 함께 합리적인 가격에 나눠보세요.\n\n주문은 마감 후 사장님이 당일 손질해 진공 포장으로 준비하고, 동네 정육점에서 픽업할 수 있어요.",
    lat: 37.4828,
    lng: 126.9272,
    pickupName: "관악 정육점",
  },
  {
    slug: "chungju-apple",
    categoryValue: "fruit",
    title: "충주 꿀사과",
    subtitle: "아침 대용으로 딱, 새콤달콤 부사",
    emoji: "🍎",
    dealType: "공구",
    productUrl: "https://example.com",
    origin: "충북 충주",
    bankAccount: {
      bank: "카카오뱅크",
      number: "3333-00-0000000",
      holder: "(주)띵동",
    },
    options: [
      { label: "2.5kg (8~10과)", retailPrice: 19900, groupPrice: 14900 },
      { label: "5kg (16~20과)", retailPrice: 36900, groupPrice: 27900 },
    ],
    unitNote: "박스 단위 · 가정용",
    targetCount: 60,
    currentCount: 18,
    deadlineAt: "2026-06-22T14:59:00+09:00",
    shipFrom: "마감 후 산지에서 순차 발송",
    highlights: [
      "일교차 큰 충주에서 자란 꿀사과",
      "공구가로 시중 대비 약 25% 저렴",
      "아침 대용·간식으로 딱 좋은 크기",
      "목표 인원 달성 시 일괄 발송",
    ],
    description:
      "일교차가 큰 충주에서 자라 당도가 높은 부사 사과예요. 띵동이 산지와 연결해 공동구매로 열었어요.\n\n혼자 한 박스 사기엔 부담스러운 양도 이웃들과 나누면 합리적이에요. 신청 마감 후 목표 인원이 모이면 산지에서 순차 발송됩니다.",
    lat: 37.4862,
    lng: 126.9282,
    pickupName: "신림 우체국 앞",
  },
  {
    slug: "fresh-egg",
    categoryValue: "egg",
    title: "무항생제 신선란 30구",
    subtitle: "동네 마트 사장님 핫딜, 매주 입고",
    emoji: "🥚",
    dealType: "핫딜",
    productUrl: "https://example.com",
    origin: "국내산 무항생제",
    bankAccount: {
      bank: "카카오뱅크",
      number: "3333-00-0000000",
      holder: "(주)띵동",
    },
    options: [
      { label: "30구 x 1판", retailPrice: 9900, groupPrice: 6900 },
      { label: "30구 x 2판", retailPrice: 19000, groupPrice: 12900 },
    ],
    unitNote: "판 단위 · 냉장",
    targetCount: 50,
    currentCount: 9,
    deadlineAt: "2026-06-19T14:59:00+09:00",
    shipFrom: "마감 다음 날 동네 마트에서 픽업",
    highlights: [
      "동네 마트 사장님이 올린 무항생제 신선란",
      "핫딜가로 시중 대비 약 30% 저렴",
      "매주 입고되는 신선한 계란",
      "목표 인원 달성 시 일괄 준비",
    ],
    description:
      "동네 마트 사장님이 띵동에 직접 올린 무항생제 신선란 핫딜이에요. 혼자 한 판 사면 다 먹기 전에 상하기 쉬운 계란, 이웃들과 함께 나눠보세요.\n\n마감 후 사장님이 준비해두면 동네 마트에서 픽업할 수 있어요.",
    lat: 37.4838,
    lng: 126.9300,
    pickupName: "이마트24 신림역점",
  },
];

/** 옵션 중 최저 공구가. 동네핫딜 칩의 "최저가~" 표기용. */
export function minGroupPrice(gb: GroupBuy): number {
  return Math.min(...gb.options.map((o) => o.groupPrice));
}

export function getGroupBuy(slug: string): GroupBuy | null {
  return GROUP_BUYS.find((g) => g.slug === slug) ?? null;
}

export function groupBuyDiscountRate(opt: GroupBuyOption): number {
  if (!opt.retailPrice) return 0;
  return Math.round(((opt.retailPrice - opt.groupPrice) / opt.retailPrice) * 100);
}
