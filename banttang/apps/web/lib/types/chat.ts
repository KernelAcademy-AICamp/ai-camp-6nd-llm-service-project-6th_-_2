// 채팅방 타임라인 아이템.
// 일반 텍스트 메시지와 영수증 카드(receipts row + OCR 메타)가 시간순으로 인터리브된다.

import type { ChatMessageWithSender, Receipt } from "./domain";

// 채팅에 카드로 떠 있는 영수증.
// receipts row 위에 표시 보조 정보(인증 결과 메시지, AI 신뢰도)를 얹는다.
export interface ReceiptCardItem extends Receipt {
  // OCR + Claude 검증 신뢰도. receipts.ocr_confidence를 그대로 노출.
  confidence?: number | null;
}

export type ChatItem =
  | { kind: "message"; at: string; data: ChatMessageWithSender }
  | { kind: "receipt"; at: string; data: ReceiptCardItem };

export function buildTimeline(
  messages: ChatMessageWithSender[],
  receipts: ReceiptCardItem[],
): ChatItem[] {
  const items: ChatItem[] = [
    ...messages.map<ChatItem>((m) => ({ kind: "message", at: m.created_at, data: m })),
    ...receipts.map<ChatItem>((r) => ({
      kind: "receipt",
      at: r.shared_to_chat_at ?? r.created_at,
      data: r,
    })),
  ];
  items.sort((a, b) => a.at.localeCompare(b.at));
  return items;
}
