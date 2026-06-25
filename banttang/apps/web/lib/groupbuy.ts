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
  productUrl: string; // 원 상품 링크(참고)
  origin: string; // 원산지/판매처
  bankAccount: BankAccount; // 입금 계좌 (챗봇 안내용)
  options: GroupBuyOption[];
  unitNote: string; // "1박스 기준" 등
  targetCount: number; // 목표 참여 인원
  deadlineAt: string; // 신청 마감 (ISO)
  shipFrom: string; // 발송 안내
  highlights: string[]; // 포인트 3~5개
  description: string; // 상세 설명(여러 줄)
};

export const GROUP_BUYS: GroupBuy[] = [
  {
    slug: "sinbi-peach",
    categoryValue: "fruit",
    title: "노지 신비복숭아",
    subtitle: "천도와 백도의 만남, 새콤달콤 여름 복숭아",
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
    targetCount: 50,
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
  },
];

export function getGroupBuy(slug: string): GroupBuy | null {
  return GROUP_BUYS.find((g) => g.slug === slug) ?? null;
}

export function groupBuyDiscountRate(opt: GroupBuyOption): number {
  if (!opt.retailPrice) return 0;
  return Math.round(((opt.retailPrice - opt.groupPrice) / opt.retailPrice) * 100);
}
