// 반띵 도메인 타입.
// 실제 Supabase 스키마(bandding-db/supabase/migrations/20260520000001_initial_schema.sql) 기준.
// supabase gen types typescript로 자동 생성되는 타입이 들어오면 이 파일은 재-export로 줄어든다.

export type PartyCategory =
  | "delivery" // Phase 1
  | "offline_shopping" // Phase 2
  | "online_shopping"; // Phase 2

export type PartyStatus =
  | "recruiting"
  | "closed"
  | "in_progress"
  | "completed"
  | "cancelled";

export type ParticipantStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "no_show";

export type UserLevel = "dandelion" | "tree" | "king";

export type ReviewRating = "good" | "bad";

export type MessageType =
  | "text"
  | "system"
  | "receipt_card"
  | "payment_card";

// 프로필. avatar_url 컬럼은 MVP에 없음 (profile-images 버킷은 Phase 2).
// UI에서 아바타가 필요하면 nickname으로 자동 생성한다 (components/ui/avatar.tsx).
export interface UserProfile {
  id: string;
  nickname: string;
  level: UserLevel;
  transaction_count: number;
  good_review_count: number;
  bad_review_count: number;
  total_review_count: number;
}

export interface Party {
  id: string;
  host_id: string;
  neighborhood_id: string;
  category: PartyCategory;
  store_name: string;
  representative_menu: string | null;
  max_participants: number;
  price_per_person: number;
  deal_at: string;
  apply_deadline_at: string;
  status: PartyStatus;
  closed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// v_parties_with_stats 뷰가 반환하는 형태. 홈 피드/상세 페이지에서 사용.
export interface PartyWithStats extends Party {
  host_nickname: string;
  host_level: UserLevel;
  host_transaction_count: number;
  approved_count: number;
  slots_left: number;
  photo_paths: string[] | null;
}

export interface PartyParticipant {
  id: string;
  party_id: string;
  user_id: string;
  status: ParticipantStatus;
  is_host: boolean;
  applied_at: string;
  approved_at: string | null;
}

export interface PartyParticipantWithProfile extends PartyParticipant {
  profile: Pick<UserProfile, "id" | "nickname" | "level"> | null;
}

export interface ChatRoom {
  id: string;
  party_id: string;
  opened_at: string;
  closed_at: string | null;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string | null;
  type: MessageType;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatMessageWithSender extends ChatMessage {
  sender: Pick<UserProfile, "id" | "nickname"> | null;
}

export interface Receipt {
  id: string;
  party_id: string;
  uploader_id: string;
  storage_path: string;
  ocr_store_name: string | null;
  ocr_total_amount: number | null;
  ocr_paid_at: string | null;
  ocr_confidence: number | null;
  final_store_name: string;
  final_total_amount: number;
  final_paid_at: string;
  price_per_person: number;
  shared_to_chat_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  party_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: ReviewRating;
  text_review: string | null;
  is_no_show: boolean;
  created_at: string;
}
