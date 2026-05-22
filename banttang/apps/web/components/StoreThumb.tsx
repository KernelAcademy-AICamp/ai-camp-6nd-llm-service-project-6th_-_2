type Props = {
  storeName: string;
  menu?: string | null;
};

// 키워드 → 이모지 매핑. 위에서부터 순서대로 매칭 (앞쪽이 우선).
const EMOJI_RULES: Array<[RegExp, string]> = [
  // 음식 카테고리
  [/치킨|닭강정|교촌|bhc|bbq|굽네|네네|푸라닭|또래오래|닭/i, "🍗"],
  [/피자|도미노|피자헛|미스터피자|파파존스/i, "🍕"],
  [/햄버거|버거|맥도날드|버거킹|롯데리아|맘스터치|쉑쉑|쉐이크|kfc/i, "🍔"],
  [/마라|훠궈|중식|짜장|짬뽕|탕수육/i, "🥢"],
  [/떡볶이|분식|순대|튀김/i, "🌶️"],
  [/김밥|김가네|바르다/i, "🍙"],
  [/라면|면|우동|국수|냉면/i, "🍜"],
  [/초밥|스시|회|사시미|롤/i, "🍣"],
  [/일식|돈까스|규동|덮밥/i, "🍱"],
  [/한식|비빔밥|국밥|찌개|백반/i, "🍚"],
  [/파스타|양식|스테이크|리조또/i, "🍝"],
  [/카페|커피|스타벅스|투썸|이디야|메가|컴포즈|빽다방/i, "☕"],
  [/디저트|케이크|마카롱|와플|크로플/i, "🍰"],
  [/베이커리|빵|파리바게뜨|뚜레쥬르/i, "🥐"],
  [/샐러드|샐러디/i, "🥗"],
  [/족발|보쌈/i, "🍖"],
  [/곱창|막창|대창/i, "🍢"],
  [/해산물|새우|랍스터|조개/i, "🦐"],
  [/도시락|한솥|본도시락/i, "🍱"],
  [/술|호프|이자카야|포차|안주/i, "🍻"],
  [/아이스크림|배스킨|빙수/i, "🍦"],
  [/타코|멕시칸|부리또/i, "🌮"],
  // 장보기·벌크
  [/쿠팡|마트|이마트|홈플러스|롯데마트|코스트코|트레이더스/i, "🛒"],
  [/닭가슴살|단백질|프로틴|허닭/i, "🍗"],
  [/과일|사과|딸기|바나나/i, "🍎"],
  [/채소|야채|샐러드/i, "🥬"],
  [/우유|치즈|유제품/i, "🥛"],
  [/물|생수|음료/i, "🥤"],
];

function pickEmoji(text: string): string {
  for (const [re, emoji] of EMOJI_RULES) {
    if (re.test(text)) return emoji;
  }
  return "🍱";
}

export function StoreThumb({ storeName, menu }: Props) {
  const haystack = `${storeName ?? ""} ${menu ?? ""}`;
  const emoji = pickEmoji(haystack);
  return (
    <div className="flex h-full w-full items-center justify-center text-3xl">{emoji}</div>
  );
}
