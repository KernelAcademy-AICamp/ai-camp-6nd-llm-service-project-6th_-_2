// ── 스토어 찜 (가게/상품) ──────────────────────────────────
export type StoreFavoriteKind = "store" | "product";

export type StoreFavoriteRow = {
  id: string;
  kind: StoreFavoriteKind;
  title: string;
  subtitle: string;
  link: string;
  image: string | null;
  created_at: string;
};

// 토글/생성 시 넘기는 스냅샷 (네이버 외부 데이터라 표시값을 그대로 저장)
export type StoreFavoriteInput = {
  kind: StoreFavoriteKind;
  title: string;
  subtitle: string;
  link: string;
  image: string | null;
};

export type PartyCategory = "delivery" | "offline_shopping" | "online_shopping";
export type PartyStatus = "recruiting" | "closed" | "in_progress" | "completed" | "cancelled";
export type Gender = "female" | "male" | "prefer_not_to_say";
export type GenderOption = "all" | "same_gender";

export type ParticipantStatus = "pending" | "approved" | "rejected" | "cancelled" | "no_show";

// 화면 표시용 derived 상태
export type DisplayStatus =
  | "recruiting"     // 모집중
  | "waiting"        // 대기중 (정원 다 찼으나 호스트 미수락)
  | "in_progress"    // 진행중 (채팅방 오픈 이후, 거래 시각 전/후 모두)
  | "completed"      // 완료
  | "cancelled";     // 취소/삭제

// ── 커뮤니티 (동네 게시판) ──────────────────────────────────
export type CommunityCategory = "free" | "question" | "share" | "info" | "meetup";

// 카테고리 메타 — 탭/뱃지 라벨·이모지 단일 소스
export const COMMUNITY_CATEGORIES: {
  value: CommunityCategory;
  label: string;
  emoji: string;
}[] = [
  { value: "free", label: "잡담", emoji: "💬" },
  { value: "question", label: "질문", emoji: "❓" },
  { value: "share", label: "나눔", emoji: "🎁" },
  { value: "info", label: "정보", emoji: "📌" },
  { value: "meetup", label: "모임", emoji: "🙌" },
];

export function communityCategoryMeta(value: CommunityCategory) {
  return (
    COMMUNITY_CATEGORIES.find((c) => c.value === value) ?? COMMUNITY_CATEGORIES[0]
  );
}

export type CommunityAuthor = {
  id: string;
  nickname: string;
  level: "dandelion" | "tree" | "king";
};

export type CommunityPostRow = {
  id: string;
  neighborhood_id: string;
  author: CommunityAuthor;
  category: CommunityCategory;
  title: string;
  body: string;
  image_urls: string[];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  created_at: string;
};

export type CommunityCommentRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author: CommunityAuthor;
  body: string;
  like_count: number;
  liked_by_me: boolean;
  created_at: string;
};

export type PartyRow = {
  id: string;
  host_id: string;
  host_nickname: string;
  host_level: "dandelion" | "tree" | "king";
  host_transaction_count: number;
  category: PartyCategory;
  store_name: string;
  representative_menu: string | null;
  max_participants: number;
  price_per_person: number;
  deal_at: string;
  apply_deadline_at: string;
  pickup_location_id: string | null;
  custom_pickup_name: string | null;
  gender_option: GenderOption;
  status: PartyStatus;
  approved_count: number;
  slots_left: number;
  created_at: string;
  photo_paths: string[] | null;
};
