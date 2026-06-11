/**
 * 반띵 (Bandding) — Database Types
 *
 * Supabase CLI의 `supabase gen types typescript`로 자동 생성한 것과
 * 동일한 구조를 가지도록 수동 작성한 타입.
 *
 * 실제 사용 시에는 아래 명령으로 재생성 권장:
 *   npx supabase gen types typescript --project-id <PROJECT_ID> > database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================================================
// ENUMS
// ============================================================================
export type Gender = 'female' | 'male' | 'prefer_not_to_say';
export type UserLevel = 'dandelion' | 'tree' | 'king';
export type PrimaryUsage =
  | 'delivery_bulk'
  | 'delivery_min'
  | 'shopping_bulk'
  | 'shopping_min';
export type PartyCategory = 'delivery' | 'offline_shopping' | 'online_shopping';
export type PartyStatus =
  | 'recruiting'
  | 'closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type ApprovalType = 'auto' | 'manual';
export type GenderOption = 'all' | 'same_gender';
export type ParticipantStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'no_show';
export type MessageType =
  | 'text'
  | 'system'
  | 'receipt_card'
  | 'payment_card';
export type SystemEventType =
  | 'party_closed'
  | 'pickup_location_set'
  | 'receipt_uploaded'
  | 'before_30min'
  | 'before_10min'
  | 'party_completed';
export type ReviewRating = 'good' | 'bad';
export type PaymentMethod =
  | 'kakao_pay'
  | 'toss'
  | 'bank_transfer'
  | 'cash'
  | 'other';
export type PaymentStatus =
  | 'pending'
  | 'sent_by_payer'
  | 'confirmed_by_receiver';
export type ReportTargetType = 'party' | 'user' | 'message' | 'review';
export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';
export type NotificationType =
  | 'application_received'
  | 'application_approved'
  | 'application_rejected'
  | 'party_closed'
  | 'before_deal'
  | 'receipt_uploaded'
  | 'review_requested'
  | 'payment_received'
  | 'phase2_available';
export type ShoppingType = 'offline' | 'online';

// ============================================================================
// TABLE ROW TYPES
// ============================================================================

export interface Neighborhood {
  id: string;
  name: string;
  district: string;
  city: string;
  center_point: unknown; // PostGIS Point - 클라이언트에서는 별도 변환
  radius_meters: number;
  is_active: boolean;
  active_user_count: number;
  created_at: string;
  updated_at: string;
}

export interface PickupLocation {
  id: string;
  neighborhood_id: string;
  name: string;
  walk_minutes: number;
  features: string[];
  point: unknown;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  nickname: string;
  gender: Gender;
  neighborhood_id: string | null;
  level: UserLevel;
  transaction_count: number;
  good_review_count: number;
  bad_review_count: number;
  total_review_count: number;
  no_show_count: number;
  is_beta_user: boolean;
  joined_at: string;
  last_active_at: string;
  created_at: string;
  updated_at: string;
  // 온보딩 맞춤 추천 선호도 (20260609000001 마이그레이션)
  primary_usage: PrimaryUsage | null;
  favorite_malls: string[];
  favorite_categories: string[];
}

export interface TermsAgreement {
  id: string;
  user_id: string;
  terms_version: string;
  agreed_items: Json;
  agreed_at: string;
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
  approval_type: ApprovalType;
  gender_option: GenderOption;
  pickup_location_id: string | null;
  custom_pickup_name: string | null;
  custom_pickup_point: unknown | null;
  paid_by_host: boolean;
  status: PartyStatus;
  closed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartyPhoto {
  id: string;
  party_id: string;
  storage_path: string;
  order_index: number;
  created_at: string;
}

export interface PartyParticipant {
  id: string;
  party_id: string;
  user_id: string;
  status: ParticipantStatus;
  is_host: boolean;
  applied_at: string;
  approved_at: string | null;
  cancelled_at: string | null;
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
  system_event: SystemEventType | null;
  content: string | null;
  metadata: Json;
  created_at: string;
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
  ocr_raw: Json | null;
  final_store_name: string;
  final_total_amount: number;
  final_paid_at: string;
  price_per_person: number;
  shared_to_chat_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  party_id: string;
  payer_id: string;
  receiver_id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  sent_at: string | null;
  confirmed_at: string | null;
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

export interface Report {
  id: string;
  reporter_id: string | null;
  target_type: ReportTargetType;
  target_id: string;
  reason_code: string;
  reason_detail: string | null;
  status: ReportStatus;
  resolved_at: string | null;
  resolved_note: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link_path: string | null;
  related_party_id: string | null;
  metadata: Json;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface Phase2Alert {
  id: string;
  user_id: string;
  neighborhood_id: string;
  shopping_type: ShoppingType;
  is_enabled: boolean;
  created_at: string;
}

// ============================================================================
// VIEW TYPES
// ============================================================================

export interface PartyWithStats extends Party {
  host_nickname: string;
  host_level: UserLevel;
  host_transaction_count: number;
  approved_count: number;
  slots_left: number;
  photo_paths: string[] | null;
}

export interface UserTrustStats {
  id: string;
  nickname: string;
  level: UserLevel;
  transaction_count: number;
  good_review_count: number;
  bad_review_count: number;
  total_review_count: number;
  no_show_count: number;
  good_review_percent: number | null;
  transactions_to_next_level: number;
}

// ============================================================================
// INSERT / UPDATE 헬퍼 타입
// ============================================================================

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type AutoGenerated = 'id' | 'created_at' | 'updated_at';
type DefaultedProfile =
  | 'level'
  | 'transaction_count'
  | 'good_review_count'
  | 'bad_review_count'
  | 'total_review_count'
  | 'no_show_count'
  | 'is_beta_user'
  | 'joined_at'
  | 'last_active_at';
type DefaultedParty =
  | 'approval_type'
  | 'gender_option'
  | 'paid_by_host'
  | 'status'
  | 'closed_at'
  | 'completed_at'
  | 'cancelled_at'
  | 'cancel_reason';

export type NewProfile = Optional<Profile, AutoGenerated | DefaultedProfile>;
export type NewParty = Optional<Party, AutoGenerated | DefaultedParty>;
export type NewParticipant = Optional<
  PartyParticipant,
  'id' | 'applied_at' | 'approved_at' | 'cancelled_at' | 'is_host'
>;
export type NewReview = Optional<
  Review,
  'id' | 'created_at' | 'is_no_show' | 'text_review'
>;
export type NewMessage = Optional<
  ChatMessage,
  'id' | 'created_at' | 'metadata' | 'system_event' | 'content'
>;
export type NewPayment = Optional<
  Payment,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'sent_at'
  | 'confirmed_at'
  | 'status'
>;

// ============================================================================
// 커뮤니티 (동네 게시판)
// ============================================================================

export type CommunityCategory = 'free' | 'question' | 'share' | 'info' | 'meetup';

export interface CommunityPost {
  id: string;
  neighborhood_id: string;
  author_id: string;
  category: CommunityCategory;
  title: string;
  body: string;
  image_paths: string[];
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  like_count: number;
  created_at: string;
  updated_at: string;
}

export interface CommunityPostLike {
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface CommunityCommentLike {
  comment_id: string;
  user_id: string;
  created_at: string;
}

export type NewCommunityPost = Optional<
  CommunityPost,
  'id' | 'category' | 'image_paths' | 'like_count' | 'comment_count' | 'created_at' | 'updated_at'
>;

// ============================================================================
// Supabase Database 인터페이스 (createClient<Database>()용)
// ============================================================================

export interface Database {
  public: {
    Tables: {
      neighborhoods: { Row: Neighborhood; Insert: Partial<Neighborhood>; Update: Partial<Neighborhood> };
      pickup_locations: { Row: PickupLocation; Insert: Partial<PickupLocation>; Update: Partial<PickupLocation> };
      profiles: { Row: Profile; Insert: NewProfile; Update: Partial<Profile> };
      terms_agreements: { Row: TermsAgreement; Insert: Omit<TermsAgreement, 'id' | 'agreed_at'>; Update: never };
      parties: { Row: Party; Insert: NewParty; Update: Partial<Party> };
      party_photos: { Row: PartyPhoto; Insert: Omit<PartyPhoto, 'id' | 'created_at'>; Update: Partial<PartyPhoto> };
      party_participants: { Row: PartyParticipant; Insert: NewParticipant; Update: Partial<PartyParticipant> };
      chat_rooms: { Row: ChatRoom; Insert: Omit<ChatRoom, 'id' | 'opened_at' | 'closed_at'>; Update: Partial<ChatRoom> };
      chat_messages: { Row: ChatMessage; Insert: NewMessage; Update: never };
      receipts: { Row: Receipt; Insert: Partial<Receipt>; Update: Partial<Receipt> };
      payments: { Row: Payment; Insert: NewPayment; Update: Partial<Payment> };
      reviews: { Row: Review; Insert: NewReview; Update: never };
      reports: { Row: Report; Insert: Partial<Report>; Update: Partial<Report> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
      phase2_alerts: { Row: Phase2Alert; Insert: Partial<Phase2Alert>; Update: Partial<Phase2Alert> };
      community_posts: { Row: CommunityPost; Insert: NewCommunityPost; Update: Partial<CommunityPost> };
      community_comments: { Row: CommunityComment; Insert: Omit<CommunityComment, 'id' | 'like_count' | 'created_at' | 'updated_at'>; Update: Partial<CommunityComment> };
      community_post_likes: { Row: CommunityPostLike; Insert: Omit<CommunityPostLike, 'created_at'>; Update: never };
      community_comment_likes: { Row: CommunityCommentLike; Insert: Omit<CommunityCommentLike, 'created_at'>; Update: never };
    };
    Views: {
      v_parties_with_stats: { Row: PartyWithStats };
      v_user_trust_stats: { Row: UserTrustStats };
    };
    Enums: {
      gender_type: Gender;
      user_level: UserLevel;
      party_category: PartyCategory;
      party_status: PartyStatus;
      approval_type: ApprovalType;
      gender_option: GenderOption;
      participant_status: ParticipantStatus;
      message_type: MessageType;
      system_event_type: SystemEventType;
      review_rating: ReviewRating;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      report_target_type: ReportTargetType;
      report_status: ReportStatus;
      notification_type: NotificationType;
      shopping_type: ShoppingType;
      community_category: CommunityCategory;
    };
  };
}
