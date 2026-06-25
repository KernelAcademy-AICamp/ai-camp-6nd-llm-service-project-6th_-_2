// 채팅방 입장 안내 — "방장봇 아보카도".
// 정책 변경 시 version을 올리면 사용자에게 다시 노출됨.

export type EntryNotice = {
  version: number;
  title: string;
  body: string;
  linkUrl?: string;
  severity: "info" | "required";
};

// 기본 안내 (운영 정책 변경 시 version 증가 + body 수정).
// 추후 Supabase config 테이블이나 RPC로 옮길 수 있게 단일 export로 분리.
export const DEFAULT_ENTRY_NOTICE: EntryNotice = {
  version: 2,
  title: "아보카도 봇 안내",
  body:
    "안녕하세요! 저는 띵동 거래를 도와주는 아보카도예요.\n이 방에서는 주문 확인, 영수증 확인, 정산 안내, 나눔 완료까지 함께 도와드릴게요.\n\n거래 전에는 상품과 금액을 확인하고, 나눔할 때는 약속 시간과 장소를 꼭 확인해 주세요.",
  severity: "info",
};
