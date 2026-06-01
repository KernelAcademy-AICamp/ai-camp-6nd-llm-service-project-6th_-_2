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
  version: 1,
  title: "방장봇 아보카도 안내",
  body:
    "함께 깨끗하게! 음식 받아갈 때 다회용 용기 가져오면 비닐 쓰레기도 줄이고 환경에도 좋아요. 작은 실천 부탁드려요 🌱",
  severity: "info",
};
