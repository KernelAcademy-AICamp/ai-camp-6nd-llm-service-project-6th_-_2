"use client";

import type { ReceiptCardItem } from "@/lib/types/chat";
import { formatKrw, formatKstDateTime } from "@/lib/utils";

interface Props {
  receipt: ReceiptCardItem;
  participantCount: number;
}

// 채팅 타임라인에 들어가는 영수증 카드.
// receipts 테이블에는 verified/rejected 상태가 없다 — row가 존재하면 이미 검증 완료.
// 인식 실패는 FastAPI가 4xx로 즉시 응답하므로 row가 만들어지지 않는다.
export function ReceiptCardMessage({ receipt, participantCount }: Props) {
  const perPerson = receipt.price_per_person
    || (participantCount ? Math.round(receipt.final_total_amount / participantCount) : 0);
  const confidencePct =
    receipt.confidence != null
      ? Math.round(receipt.confidence * 100)
      : receipt.ocr_confidence != null
        ? Math.round(receipt.ocr_confidence * 100)
        : null;

  return (
    <div className="my-2 flex w-full justify-center">
      <article className="w-full max-w-sm overflow-hidden rounded-xl border border-foreground/10 bg-background shadow-sm">
        <header className="flex items-center justify-between border-b border-foreground/10 bg-foreground/[0.03] px-4 py-2">
          <span className="text-xs font-medium text-foreground/70">🧾 영수증 인증</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
            AI 인증 완료
            {confidencePct != null && (
              <span className="ml-1 opacity-80">({confidencePct}%)</span>
            )}
          </span>
        </header>

        <div className="space-y-2 px-4 py-3">
          <p className="text-sm font-semibold">{receipt.final_store_name}</p>
          <dl className="grid grid-cols-[64px_1fr] gap-y-1 text-xs">
            <dt className="text-foreground/50">결제 금액</dt>
            <dd className="font-medium">{formatKrw(receipt.final_total_amount)}</dd>
            <dt className="text-foreground/50">결제 시각</dt>
            <dd>{formatKstDateTime(receipt.final_paid_at)}</dd>
          </dl>

          {perPerson > 0 && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-brand/10 px-3 py-2">
              <span className="text-xs text-foreground/70">1인당</span>
              <span className="text-base font-bold text-brand">
                {formatKrw(perPerson)}
              </span>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
