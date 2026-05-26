// 영수증 검증 FastAPI 호출 래퍼.
// multipart 업로드라 fastApiFetch(JSON) 대신 직접 fetch로 작성한다.
// 동기 처리: 서버가 OCR + Claude 검증을 끝낸 뒤 receipts row를 INSERT해 반환.

import { FastApiError } from "./client";
import type { Receipt } from "@/lib/types/domain";

const BASE_URL =
  process.env.NEXT_PUBLIC_FASTAPI_BASE_URL ?? "http://localhost:8000";

interface SubmitReceiptInput {
  partyId: string;
  file: File;
  totalAmount: number;
  accessToken: string;
}

export async function submitReceipt({
  partyId,
  file,
  totalAmount,
  accessToken,
}: SubmitReceiptInput): Promise<Receipt> {
  const form = new FormData();
  form.append("party_id", partyId);
  form.append("total_amount", String(totalAmount));
  form.append("file", file);

  const res = await fetch(`${BASE_URL}/ocr/verify-receipt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    throw new FastApiError(
      res.status,
      body,
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `영수증 검증 요청 실패 (${res.status})`,
    );
  }

  return (await res.json()) as Receipt;
}
