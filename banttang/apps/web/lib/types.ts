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
