// 띵동 온보딩 챗봇 스크립트.
// 콘텐츠 수정은 이 파일만 만지면 됨. 컴포넌트 로직은 OnboardingTour.tsx.
//
// 단계 종류:
//   bot           — 봇 흰 말풍선 (자동 다음 단계로 진행)
//   rich_cards    — 챗 흐름 안 예시 카드 묶음 (자동 진행)
//   type_matrix   — 4가지 거래 유형 매트릭스 (자동 진행)
//   choice        — 하단 단일 선택 버튼
//   chips         — 하단 다중 선택 칩 + "선택 완료"
//   address       — 위치 설정 인라인 패널
//   finish        — 마무리. cta 누르면 nextHref로 라우팅

export interface SampleCard {
  emoji: string;
  title: string;
  subtitle?: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface ChipOption {
  emoji: string;
  label: string;
  value: string;
  // 상위 선택 후 한 단계 더 보여줄 하위 항목들. 없거나 빈 배열이면 sub 단계 스킵.
  subOptions?: { label: string; value: string }[];
}

export type Step =
  | { id: string; kind: "bot"; text: string }
  | {
      id: string;
      kind: "rich_cards";
      cards: SampleCard[];
      // 카드 하나씩 공개. 마지막 카드 체크 시 UserBubble 라벨로 표시 + 다음 단계로.
      finalUserLabel: string;
    }
  | { id: string; kind: "type_matrix" }
  | { id: string; kind: "choice"; options: ChoiceOption[]; saveAs?: string }
  | {
      id: string;
      kind: "chips";
      options: ChipOption[];
      saveAs: string;
      allowOther?: boolean;
    }
  | { id: string; kind: "address"; saveAs: string }
  | {
      id: string;
      kind: "finish";
      cta: string;
      nextHref: string;
      secondaryCta?: string;
      secondaryHref?: string;
    };

export const STEPS: Step[] = [
  // ───────── 1. 인사 ─────────
  { id: "1-1", kind: "bot", text: "안녕하세요! 띵동의 가이드 아봇이에요 🤖" },
  {
    id: "1-2",
    kind: "bot",
    text: "1분만 함께해요. 띵동 사용법, 같이 휙 둘러볼게요!",
  },
  { id: "1-c", kind: "choice", options: [{ value: "go", label: "좋아요!" }] },

  // ───────── 2. 4가지 유형 개요 ─────────
  {
    id: "2-1",
    kind: "bot",
    text: "띵동엔 2개 카테고리, 4가지 거래 유형이 있어요",
  },
  {
    id: "2-2",
    kind: "bot",
    text: "배달음식이냐 장보기냐, 그리고 똑같이 나누냐 각자 담느냐로 나뉘어요",
  },
  { id: "2-matrix", kind: "type_matrix" },
  { id: "2-3", kind: "bot", text: "하나씩 예시로 볼까요?" },
  { id: "2-c", kind: "choice", options: [{ value: "go", label: "좋아요!" }] },

  // ───────── 3. 첫 번째 — 배달 × 같은 상품 나눠요 ─────────
  {
    id: "3-0",
    kind: "bot",
    text: "1️⃣ 배달 × 같은 상품 나눠요 🍗",
  },
  {
    id: "3-1",
    kind: "bot",
    text: "혼자 살면 치킨 한 마리, 피자 라지 시키기 부담스러운 적 있으시죠?",
  },
  {
    id: "3-2",
    kind: "bot",
    text: "이렇게 양 많은 음식을 동네 사람과 같이 시켜서 똑같이 소분해가는 방식이에요",
  },
  {
    id: "3-cards",
    kind: "rich_cards",
    finalUserLabel: "오, 좋네요!",
    cards: [
      { emoji: "🍗", title: "두마리 치킨 같이 시키고 한마리씩 가져가기" },
      { emoji: "🍕", title: "피자 같이 시키고 반씩 나누기" },
      { emoji: "🌶️", title: "엽떡 같이 시키고 소분하기" },
    ],
  },

  // ───────── 4. 두 번째 — 배달 × 각자 상품 담아요 ─────────
  {
    id: "4-0",
    kind: "bot",
    text: "2️⃣ 배달 × 각자 상품 담아요 🛵",
  },
  {
    id: "4-1",
    kind: "bot",
    text: "혼자 시키면 최소주문금액 안 차서 못 시킨 적 있죠? 😢",
  },
  {
    id: "4-2",
    kind: "bot",
    text: "배송비만 4-5천 원씩 따로 내는 것도 아깝고요",
  },
  {
    id: "4-3",
    kind: "bot",
    text: "각자 먹고 싶은 메뉴는 따로 담고, 최소금액·배송비만 같이 나눠요",
  },
  {
    id: "4-cards",
    kind: "rich_cards",
    finalUserLabel: "편하겠다!",
    cards: [
      {
        emoji: "🛵",
        title: "중국집 최소주문 15,000원? 각자 짜장면 한 그릇씩 시켜 가져가요",
      },
    ],
  },

  // ───────── 5. 세 번째 — 장보기 × 같은 상품 나눠요 ─────────
  {
    id: "5-0",
    kind: "bot",
    text: "3️⃣ 장보기 × 같은 상품 나눠요 🛒",
  },
  {
    id: "5-1",
    kind: "bot",
    text: "코스트코·트레이더스 가성비 좋은데, 양이 너무 많지 않으세요?",
  },
  {
    id: "5-2",
    kind: "bot",
    text: "동네 사람들이랑 벌크로 같이 사서 단가 그대로 필요한 만큼만 가져가요",
  },
  {
    id: "5-cards",
    kind: "rich_cards",
    finalUserLabel: "좋아요!",
    cards: [
      { emoji: "🧻", title: "크리넥스 30롤 같이 사서 소분하기" },
      { emoji: "🍗", title: "허닭 닭가슴살 60팩 공구하기" },
      { emoji: "🛒", title: "코스트코 정육 상품 나누기" },
    ],
  },

  // ───────── 6. 네 번째 — 장보기 × 각자 상품 담아요 ─────────
  {
    id: "6-0",
    kind: "bot",
    text: "4️⃣ 장보기 × 각자 상품 담아요 📦",
  },
  {
    id: "6-1",
    kind: "bot",
    text: "온라인으로 장 볼때도 최소주문금액, 배송비때문에 1인 가구는 힘들죠?",
  },
  {
    id: "6-2",
    kind: "bot",
    text: "작은 거 하나 사려고 안 쓰는 물건까지 담아본 경험, 있으시잖아요",
  },
  {
    id: "6-3",
    kind: "bot",
    text: "필요한 것만 담고 동네 사람과 주문 조건 채워요",
  },
  {
    id: "6-cards",
    kind: "rich_cards",
    finalUserLabel: "이해했어요!",
    cards: [
      { emoji: "🛍️", title: "다이소 몰 / 올리브영 최소주문금액 같이 채우기" },
      { emoji: "📦", title: "쇼핑몰, 해외직구 배송비 같이 나누기" },
    ],
  },

  // ───────── 7. 관심사 인트로 ─────────
  { id: "7-1", kind: "bot", text: "사용 방법은 다 보셨어요 👏" },
  { id: "7-2", kind: "bot", text: "이제 띵동을 더 잘 써먹게 몇 가지만 알려주세요" },
  { id: "7-3", kind: "bot", text: "맞춤 추천에 반영해드릴게요 ✨" },
  { id: "7-c", kind: "choice", options: [{ value: "go", label: "좋아요" }] },

  // ───────── 8. Q1 — 주 사용 유형 ─────────
  {
    id: "8-1",
    kind: "bot",
    text: "어떤 식으로 가장 많이 쓰실 것 같아요?",
  },
  {
    id: "8-c",
    kind: "choice",
    saveAs: "primary_usage",
    options: [
      { value: "delivery_bulk", label: "🛵 배달 — 같은 상품 나눠요" },
      { value: "delivery_min", label: "🛵 배달 — 각자 상품 담아요" },
      { value: "shopping_bulk", label: "🛒 장보기 — 같은 상품 나눠요" },
      { value: "shopping_min", label: "🛒 장보기 — 각자 상품 담아요" },
    ],
  },

  // ───────── 9. Q2 — 관심 몰 ─────────
  { id: "9-1", kind: "bot", text: "자주 가시는 몰을 모두 골라주세요" },
  { id: "9-2", kind: "bot", text: "추천 받을 때 참고할게요" },
  {
    id: "9-c",
    kind: "chips",
    saveAs: "favorite_malls",
    allowOther: true,
    options: [
      {
        emoji: "🏬",
        label: "창고형",
        value: "warehouse",
        subOptions: [
          { label: "트레이더스", value: "traders" },
          { label: "코스트코", value: "costco" },
        ],
      },
      {
        emoji: "🛵",
        label: "배달 플랫폼",
        value: "delivery_app",
        subOptions: [
          { label: "배민", value: "baemin" },
          { label: "요기요", value: "yogiyo" },
          { label: "컬리", value: "kurly" },
        ],
      },
      {
        emoji: "🛒",
        label: "가성비 몰",
        value: "value",
        subOptions: [
          { label: "다이소몰", value: "daiso" },
          { label: "쿠팡", value: "coupang" },
        ],
      },
      {
        emoji: "💄",
        label: "뷰티/웰니스",
        value: "beauty_wellness",
        subOptions: [
          { label: "올리브영", value: "oliveyoung" },
          { label: "마이프로틴", value: "myprotein" },
          { label: "iHerb", value: "iherb" },
          { label: "허닭", value: "heedark" },
        ],
      },
      {
        emoji: "🌾",
        label: "지역 농산물",
        value: "local_farm",
        subOptions: [
          { label: "어글리어스", value: "uglieus" },
          { label: "남도마켓", value: "namdo" },
        ],
      },
    ],
  },

  // ───────── 10. Q3 — 관심 품목 ─────────
  { id: "10-1", kind: "bot", text: "평소 자주 사시는 품목도 알려주세요" },
  {
    id: "10-c",
    kind: "chips",
    saveAs: "favorite_categories",
    allowOther: true,
    options: [
      {
        emoji: "🥬",
        label: "대용량 식재료",
        value: "bulk_grocery",
        subOptions: [
          { label: "고기", value: "meat" },
          { label: "야채", value: "vegetable" },
          { label: "과일", value: "fruit" },
          { label: "김치", value: "kimchi" },
        ],
      },
      {
        emoji: "☕",
        label: "음료·스낵",
        value: "drinks_snacks",
        subOptions: [
          { label: "커피", value: "coffee" },
          { label: "과자", value: "snack" },
        ],
      },
      {
        emoji: "🧻",
        label: "생필품",
        value: "household",
        subOptions: [
          { label: "휴지", value: "tissue" },
          { label: "세제", value: "detergent" },
          { label: "기저귀", value: "diaper" },
          { label: "생리대", value: "sanitary" },
        ],
      },
      {
        emoji: "💊",
        label: "뷰티·웰니스",
        value: "wellness",
        subOptions: [
          { label: "영양제", value: "supplement" },
          { label: "마스크팩", value: "mask" },
          { label: "프로틴", value: "protein" },
          { label: "닭가슴살", value: "chickenbreast" },
        ],
      },
      {
        emoji: "👕",
        label: "패션",
        value: "fashion",
        subOptions: [
          { label: "양말", value: "socks" },
          { label: "티셔츠", value: "tshirt" },
          { label: "운동복", value: "workout" },
        ],
      },
    ],
  },

  // ───────── 11. 주소 ─────────
  { id: "11-1", kind: "bot", text: "거의 다 됐어요!" },
  {
    id: "11-2",
    kind: "bot",
    text: "동네 사람과 매칭되니까 위치 정보만 알려주세요",
  },
  { id: "11-c", kind: "address", saveAs: "address" },

  // ───────── 12. 마무리 → 호스트 만들기로 ─────────
  { id: "12-1", kind: "bot", text: "기본 세팅 완료! 🎉" },
  { id: "12-2", kind: "bot", text: "직접 만들어보면서 사용해보는 게 제일 빨라요" },
  { id: "12-3", kind: "bot", text: "첫 반띵, 같이 만들러 가볼까요?" },
  {
    id: "12-c",
    kind: "finish",
    cta: "첫 반띵 만들러 가기",
    nextHref: "/host/new",
    secondaryCta: "일단 둘러보기",
    secondaryHref: "/feed",
  },
];
