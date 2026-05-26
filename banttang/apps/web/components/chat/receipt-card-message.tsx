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
  const perPerson =
    receipt.price_per_person ||
    (participantCount ? Math.round(receipt.final_total_amount / participantCount) : 0);
  const confidencePct =
    receipt.confidence != null
      ? Math.round(receipt.confidence * 100)
      : receipt.ocr_confidence != null
        ? Math.round(receipt.ocr_confidence * 100)
        : null;

  return (
    <div className="my-3 flex w-full justify-center">
      <article className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.05]">
        <header className="flex items-center justify-between px-4 pb-2 pt-3">
          <div className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"
                stroke="#ff6b35"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M9 8h6M9 11h6M9 14h4" stroke="#ff6b35" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="text-[12px] font-semibold text-gray-700">영수증 인증</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12l4 4 10-10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            AI 인증 완료
            {confidencePct != null && <span className="font-medium opacity-70">({confidencePct}%)</span>}
          </span>
        </header>

        <div className="px-4 pb-4">
          <p className="text-[15px] font-bold text-gray-900">{receipt.final_store_name}</p>
          <dl className="mt-2 grid grid-cols-[68px_1fr] gap-y-1 text-[12px]">
            <dt className="text-gray-400">결제 금액</dt>
            <dd className="font-medium text-gray-800">{formatKrw(receipt.final_total_amount)}</dd>
            <dt className="text-gray-400">결제 시각</dt>
            <dd className="text-gray-700">{formatKstDateTime(receipt.final_paid_at)}</dd>
          </dl>

          {perPerson > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-brand/[0.08] px-3.5 py-2.5">
              <span className="text-[12px] font-medium text-gray-600">1인당</span>
              <span className="text-[17px] font-bold text-brand">{formatKrw(perPerson)}</span>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
