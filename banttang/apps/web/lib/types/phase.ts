// 채팅방 진행 단계 — 기능명세서 F203 기준 4단계 + 완료/취소 종결 상태.
// 파티 status + 영수증 존재 여부 + 반띵 시간 기준으로 도출한다.

import type { Receipt, PartyStatus } from "./domain";

export type ChatPhase =
  | "chat"            // 채팅 진행중 (영수증 미인증, 반띵 시간까지 1시간 이상 남음)
  | "verify_pending"  // 인증 대기 (반띵 시간 1시간 내, 파티장이 영수증 인증해야 함)
  | "verified"        // 인증 완료 (영수증 등록됨, 반띵 시간 전)
  | "review_pending"  // 거래 확인 대기 (반띵 시간 도달, 모두 평가 제출 대기)
  | "completed"       // 완료된 반띵 (모두 평가 제출 완료)
  | "cancelled";      // 취소됨

export interface DerivePhaseInput {
  status: PartyStatus;
  receipts: Pick<Receipt, "id">[];
  dealAt: string;
  now?: Date;
}

const VERIFY_WINDOW_MS = 60 * 60 * 1000; // 1시간

export function derivePhase({ status, receipts, dealAt, now }: DerivePhaseInput): ChatPhase {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";

  const nowMs = (now ?? new Date()).getTime();
  const dealMs = new Date(dealAt).getTime();
  const verified = receipts.length > 0;

  if (!verified) {
    return nowMs >= dealMs - VERIFY_WINDOW_MS ? "verify_pending" : "chat";
  }
  return nowMs >= dealMs ? "review_pending" : "verified";
}

export const PHASE_STEPS: ChatPhase[] = [
  "chat",
  "verify_pending",
  "verified",
  "review_pending",
];

export const PHASE_LABEL: Record<ChatPhase, string> = {
  chat: "채팅 진행중",
  verify_pending: "인증 대기",
  verified: "인증 완료",
  review_pending: "거래 확인 대기",
  completed: "완료된 반띵",
  cancelled: "취소됨",
};
