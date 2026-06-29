"use client";

// 게스트용 영수증 확인 시트 — 호스트가 등록한 영수증 금액/내역을 확인.
// (게스트는 등록 권한이 없으므로 업로드 폼 대신 확인 뷰를 연다)

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { formatKrw, formatKstDateTime } from "@/lib/utils";
import type { Receipt } from "@/lib/types/domain";

export function ReceiptViewSheet({
  open,
  onClose,
  receipt,
  participantCount,
  onRequest,
}: {
  open: boolean;
  onClose: () => void;
  receipt: Receipt | null;
  participantCount: number;
  // 게스트가 호스트에게 영수증 인증 요청. 성공 시 ok:true.
  onRequest?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  async function handleRequest() {
    if (!onRequest || requesting || requested) return;
    setRequesting(true);
    const res = await onRequest();
    setRequesting(false);
    if (res.ok) setRequested(true);
    else alert(res.error ?? "요청에 실패했어요.");
  }

  const perPerson = receipt
    ? receipt.price_per_person ||
      (participantCount
        ? Math.round(receipt.final_total_amount / participantCount)
        : 0)
    : 0;

  return (
    <Sheet open={open} onClose={onClose} title="영수증 확인">
      {receipt ? (
        <div className="space-y-4 p-5">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-900">
            📋 주문 내역과 금액이 맞는지 확인해 주세요.
          </p>
          <dl className="space-y-2.5 rounded-xl border border-zinc-200 p-4 text-[14px]">
            <div className="flex justify-between">
              <dt className="text-zinc-500">가게</dt>
              <dd className="font-semibold text-zinc-900">{receipt.final_store_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">총 금액</dt>
              <dd className="font-semibold text-zinc-900">{formatKrw(receipt.final_total_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">1인 금액</dt>
              <dd className="font-bold text-brand-dark">{formatKrw(perPerson)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">결제 일시</dt>
              <dd className="text-zinc-700">{formatKstDateTime(receipt.final_paid_at)}</dd>
            </div>
          </dl>
          <p className="text-[12px] leading-relaxed text-zinc-400">
            금액이 다르면 채팅으로 파티장에게 알려주세요. 정산은 이웃끼리 직접 송금해요.
          </p>
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <span className="mb-2 block text-4xl" aria-hidden>🧾</span>
          <p className="text-[15px] font-bold text-zinc-900">아직 영수증이 없어요</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
            파티장이 주문 후 영수증을 등록하면
            <br />
            여기서 금액을 확인할 수 있어요.
          </p>
          {onRequest && (
            <button
              type="button"
              onClick={handleRequest}
              disabled={requesting || requested}
              className="mt-5 w-full rounded-xl bg-brand py-3 text-[15px] font-bold text-white transition active:scale-[0.99] disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              {requested ? "요청했어요 ✓" : requesting ? "요청 중…" : "영수증 인증 요청하기"}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
