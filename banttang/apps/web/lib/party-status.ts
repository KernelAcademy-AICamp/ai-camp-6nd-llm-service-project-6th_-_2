import type { DisplayStatus, PartyStatus } from "./types";

// schema의 party.status + 신청자 점유율로 화면 표시 상태 계산.
// PRD 기준: 채팅방 생성 이후(거래 시각 전/후 모두)는 단일 "진행중" 상태.
export function deriveDisplayStatus(
  status: PartyStatus,
  occupiedCount: number,
  maxParticipants: number,
): DisplayStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  if (status === "in_progress" || status === "closed") return "in_progress";
  // recruiting
  return occupiedCount >= maxParticipants ? "waiting" : "recruiting";
}

export const displayStatusLabel: Record<DisplayStatus, string> = {
  recruiting: "모집중",
  waiting: "호스트 수락 대기중",
  in_progress: "진행중",
  completed: "완료",
  cancelled: "취소",
};

export const displayStatusColor: Record<DisplayStatus, string> = {
  recruiting: "bg-emerald-100 text-emerald-700",
  waiting: "bg-amber-100 text-amber-700",
  in_progress: "bg-sky-100 text-sky-700",
  completed: "bg-zinc-100 text-zinc-600",
  cancelled: "bg-rose-100 text-rose-700",
};

export const categoryLabel: Record<string, string> = {
  delivery: "배달",
  offline_shopping: "오프라인 장보기",
  online_shopping: "온라인 장보기",
};

export const levelLabel: Record<string, string> = {
  dandelion: "민들레",
  tree: "나무",
  king: "왕대왕",
};

export function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

export function formatKstShort(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

// 카드 강조용 — "6/1(일) 오후 6:25"
const KST_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export function formatKstFriendly(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const w = KST_WEEKDAYS[kst.getUTCDay()];
  const h24 = kst.getUTCHours();
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  const ap = h24 < 12 ? "오전" : "오후";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${m}/${day}(${w}) ${ap} ${h12}:${mi}`;
}

export function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}
