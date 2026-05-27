// 영수증/주문 중복 인증 검증 — 명세서 v2 §5 기준.
// - 키 정규화 (§5-1)
// - 메인/폴백 키 결정 (§5-3 step 3)
// - Prisma 중복 조회 (partial unique index와 동일한 WHERE 모양)
//
// DB 레벨 partial unique가 동시 요청까지 막아주지만, 좋은 UX를 위해 INSERT 전에
// 사전 조회로 빠른 409를 돌려준다. 실 INSERT 시점의 P2002(unique constraint)는
// 호출자(API 라우트)에서 별도 처리.

import type { PrismaClient } from "@prisma/client";
import type { ReceiptExtraction, SourceType } from "./schema";

// ============================================================================
// §5-1. 키 정규화
// ============================================================================

// 공백 제거, 하이픈 유지, 영문 대문자.
export function normalizeOrderId(orderId: string): string {
  return orderId.replace(/\s+/g, "").toUpperCase();
}

// 공백/특수문자 제거 후 소문자.
// \p{L} 문자, \p{N} 숫자 — 한글/영문/숫자 보존, 나머지(괄호·하이픈·점·기호) 제거.
// NFC 정규화로 한글 합성형 통일.
export function normalizeMerchant(merchant: string): string {
  return merchant
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

// 분 단위 truncate. UTC 기준 YYYYMMDDHHmm 12자리 문자열.
// OCR이 초 단위까지 잘못 읽었어도 분까지만 보면 같은 거래로 본다.
// 잘못된 일자 입력은 null.
export function normalizePaidAtToMinute(
  paidAt: Date | string,
): string | null {
  const d = typeof paidAt === "string" ? new Date(paidAt) : paidAt;
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${day}${h}${min}`;
}

// 폴백 키 형식: "merchant|YYYYMMDDHHmm|amount"
// merchant는 normalize 후 값, paidAtMinute는 normalizePaidAtToMinute 결과.
export function buildFallbackKey(
  merchant: string,
  paidAtMinute: string,
  totalAmount: number,
): string {
  return `${normalizeMerchant(merchant)}|${paidAtMinute}|${totalAmount}`;
}

// ============================================================================
// §5-3 step 3. 메인 키 / 폴백 키 결정
// ============================================================================

export type DedupKey =
  | { kind: "main"; sourceType: SourceType; orderId: string }
  | { kind: "fallback"; fallbackKey: string };

export type DedupKeyResult =
  | { ok: true; key: DedupKey }
  | {
      ok: false;
      reason: "not_receipt" | "no_source_type" | "no_dedup_fields";
      message: string;
    };

// 추출 결과 → dedup 키.
// 우선순위: order_id 있으면 메인, 없으면 (merchant + paid_at + total_amount) 폴백.
// 어느 쪽도 불가능하면 dedup 자체 불가 — 호출자가 별도 처리 (수동 검토 등).
//
// 영수증 자체가 아닌 이미지(is_receipt=false 또는 신뢰도<0.3)는 dedup 불가로 본다.
// 명세서 §4 항목 4의 임계값(0.3)을 여기서도 동일하게 적용.
export function deriveDedupKey(
  extraction: Pick<
    ReceiptExtraction,
    | "is_receipt"
    | "is_receipt_confidence"
    | "source_type"
    | "order_id"
    | "merchant"
    | "paid_at"
    | "total_amount"
  >,
): DedupKeyResult {
  if (!extraction.is_receipt || extraction.is_receipt_confidence < 0.3) {
    return {
      ok: false,
      reason: "not_receipt",
      message: "영수증으로 판별되지 않음 — dedup 불가",
    };
  }

  if (!extraction.source_type) {
    return {
      ok: false,
      reason: "no_source_type",
      message: "소스 분류 실패 — dedup 불가",
    };
  }

  // 메인 키
  const rawOrderId = extraction.order_id?.trim() ?? "";
  if (rawOrderId.length > 0) {
    return {
      ok: true,
      key: {
        kind: "main",
        sourceType: extraction.source_type,
        orderId: normalizeOrderId(rawOrderId),
      },
    };
  }

  // 폴백 키 — 세 필드 모두 있어야
  if (
    !extraction.merchant ||
    !extraction.paid_at ||
    extraction.total_amount === null
  ) {
    return {
      ok: false,
      reason: "no_dedup_fields",
      message:
        "주문번호 없음 + 폴백 키 (상호/일시/금액) 일부 누락 — dedup 불가",
    };
  }

  const paidAtMinute = normalizePaidAtToMinute(extraction.paid_at);
  if (!paidAtMinute) {
    return {
      ok: false,
      reason: "no_dedup_fields",
      message: "paid_at 파싱 실패",
    };
  }

  return {
    ok: true,
    key: {
      kind: "fallback",
      fallbackKey: buildFallbackKey(
        extraction.merchant,
        paidAtMinute,
        extraction.total_amount,
      ),
    },
  };
}

// ============================================================================
// §5-3 step 3-4. Prisma 중복 조회
// ============================================================================

// 중복 응답에 노출할 필드. user_id는 호출자가 "본인이 썼는지/타인이 썼는지" 분기
// 메시지 만들 때 쓸 수 있도록 같이 반환.
export interface DuplicateExistingRow {
  id: bigint;
  userId: bigint;
  sourceType: string;
  orderId: string | null;
  fallbackKey: string | null;
  totalAmount: number;
  paidAt: Date | null;
  createdAt: Date;
}

export type CheckDuplicateResult =
  | { duplicate: false }
  | { duplicate: true; existing: DuplicateExistingRow; message: string };

// §5-4 사용자 메시지.
export const DUPLICATE_MESSAGES = {
  main: "이 주문은 이미 인증에 사용되었습니다.",
  fallback: "이 결제 건은 이미 인증되었습니다.",
} as const;

// Partial unique index의 WHERE 절과 동일한 모양으로 조회:
//   uq_redeem_order:    WHERE order_id IS NOT NULL  → (source_type, order_id)
//   uq_redeem_fallback: WHERE order_id IS NULL AND fallback_key IS NOT NULL
//
// findUnique 대신 findFirst를 쓰는 이유: Prisma는 partial unique를 모르므로
// 인덱스 정의와 정확히 일치하는 WHERE를 명시해야 안전하다.
//
// dedup은 user_id 무관 — 같은 영수증을 다른 계정으로 다시 쓰는 어뷰즈도 막아야 한다.
export async function checkDuplicate(
  prisma: PrismaClient,
  key: DedupKey,
): Promise<CheckDuplicateResult> {
  const select = {
    id: true,
    userId: true,
    sourceType: true,
    orderId: true,
    fallbackKey: true,
    totalAmount: true,
    paidAt: true,
    createdAt: true,
  } as const;

  const existing: DuplicateExistingRow | null =
    key.kind === "main"
      ? await prisma.receiptRedemption.findFirst({
          where: {
            sourceType: key.sourceType,
            orderId: key.orderId,
          },
          select,
        })
      : await prisma.receiptRedemption.findFirst({
          where: {
            orderId: null,
            fallbackKey: key.fallbackKey,
          },
          select,
        });

  if (!existing) return { duplicate: false };

  return {
    duplicate: true,
    existing,
    message: DUPLICATE_MESSAGES[key.kind],
  };
}
