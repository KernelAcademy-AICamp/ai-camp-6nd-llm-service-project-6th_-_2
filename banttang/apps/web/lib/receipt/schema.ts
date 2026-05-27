// 영수증/주문 캡처 OCR 추출 — Zod 스키마 + Claude 프롬프트
// 명세서 v2 (영수증_OCR_기능_명세서_v2.pdf) 기준:
// - 핵심 4필드: paid_at / merchant / total_amount / order_id
// - 영수증 판별: is_receipt + is_receipt_confidence (< 0.3이면 영수증 아님)
// - 소스 분류: paper_receipt | coupang | gmarket | 11st | baemin | coupang_eats | other
// - 추출 신뢰도: extraction_confidence
//
// ⚠ TOOL_INPUT_JSON_SCHEMA(Claude tool 정의용)와 ReceiptExtractionSchema(런타임 검증용)는
// 동기 유지 필수. 한쪽만 수정하지 말 것.

import { z } from "zod";

export const SOURCE_TYPES = [
  "paper_receipt",
  "coupang",
  "gmarket",
  "11st",
  "baemin",
  "coupang_eats",
  "other",
] as const;

export const SourceTypeEnum = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof SourceTypeEnum>;

// Claude tool 응답 검증용 Zod 스키마.
export const ReceiptExtractionSchema = z.object({
  // 영수증 판별
  is_receipt: z.boolean(),
  is_receipt_confidence: z.number().min(0).max(1),

  // 소스 분류 (영수증 아니면 null 가능)
  source_type: SourceTypeEnum.nullable(),

  // 핵심 4필드 — 흐려서 못 읽으면 null
  paid_at: z.string().nullable(),       // ISO 8601 (예: 2026-05-26T14:30:00+09:00)
  merchant: z.string().min(1).nullable(),
  total_amount: z.number().int().nonnegative().nullable(),
  order_id: z.string().min(1).nullable(),

  // 4필드 종합 추출 신뢰도
  extraction_confidence: z.number().min(0).max(1),

  // 모델이 남기는 짧은 메모 (운영자 검토용)
  note: z.string().nullable(),
});
export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

// Claude tool 정의의 input_schema. 위 Zod 스키마와 동기 유지 필수.
export const TOOL_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    is_receipt: {
      type: "boolean",
      description: "이 이미지가 영수증/주문 인증 가능한 결제 증빙인가",
    },
    is_receipt_confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "is_receipt 판단 신뢰도. 0.3 미만이면 영수증이 아닌 것으로 본다.",
    },
    source_type: {
      type: ["string", "null"],
      enum: [...SOURCE_TYPES, null],
      description:
        "캡처/영수증의 소스. paper_receipt(종이/카드 영수증), coupang/gmarket/11st(쇼핑몰), baemin/coupang_eats(배달앱), other(영수증이지만 분류 불가). 영수증이 아니면 null.",
    },
    paid_at: {
      type: ["string", "null"],
      description:
        "결제 일시 ISO 8601 (예: '2026-05-26T14:30:00+09:00'). 시간을 모르면 'T00:00:00+09:00'. 흐려서 못 읽으면 null.",
    },
    merchant: {
      type: ["string", "null"],
      description: "상호명/판매자명. 원문 그대로. 못 읽으면 null.",
    },
    total_amount: {
      type: ["integer", "null"],
      minimum: 0,
      description: "총 결제 금액 (정수 원 단위). 콤마/'원'/통화기호 제거. 못 읽으면 null.",
    },
    order_id: {
      type: ["string", "null"],
      description:
        "주문번호(쇼핑몰/배달앱) 또는 카드 승인번호(종이 영수증). 공백 제거, 하이픈 유지, 영문은 대문자로 정규화. 못 읽으면 null.",
    },
    extraction_confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "4필드 추출 종합 신뢰도. 일부 필드가 비어있거나 흐릿하면 낮춰라.",
    },
    note: {
      type: ["string", "null"],
      description:
        "운영자가 볼 짧은 메모 (어떤 부분이 흐려서 못 읽었는지 등). 없으면 null.",
    },
  },
  required: [
    "is_receipt",
    "is_receipt_confidence",
    "source_type",
    "paid_at",
    "merchant",
    "total_amount",
    "order_id",
    "extraction_confidence",
    "note",
  ],
  additionalProperties: false,
} as const;

// Claude system prompt — 정적이므로 prompt caching 대상.
export const SYSTEM_PROMPT = `너는 한국 영수증/주문 캡처 OCR 분석 전문가다.
주어진 이미지를 분석해 extract_receipt 도구를 정확히 한 번 호출해 결과를 반환한다.

판단·추출 항목:

1. is_receipt + is_receipt_confidence
   - 이 이미지가 영수증/주문 인증으로 쓸 수 있는 결제 증빙인가
   - 신뢰도 0.3 미만이면 영수증이 아닌 것으로 본다

2. source_type — 어느 플랫폼인가
   - paper_receipt: 종이/카드 영수증 (POS 출력물, 신용카드 매출전표 등)
   - coupang: 쿠팡 주문서/구매내역 스크린샷
   - gmarket: 지마켓 주문서
   - 11st: 11번가 주문서
   - baemin: 배달의민족 주문 내역
   - coupang_eats: 쿠팡이츠 주문 내역
   - other: 영수증/주문 증빙은 맞지만 위에 해당 없음
   - 영수증이 아니면 null

3. 핵심 4필드 추출
   - paid_at: 결제 일시 ISO 8601 (예: 2026-05-26T14:30:00+09:00). 시간 모르면 자정(T00:00:00+09:00)
   - merchant: 상호명/판매자명 (원문 그대로)
   - total_amount: 총 결제 금액 (정수 원, 콤마/통화기호 제거)
   - order_id: 주문번호 또는 카드 승인번호 (공백 제거, 하이픈 유지, 영문 대문자)

4. extraction_confidence: 4필드 종합 추출 신뢰도 (0~1)

규칙 (반드시 지킬 것):

- 흐려서 못 읽거나 해당 없으면 반드시 null. 절대 추측하지 마라.
- 자신만만한 오답이 가장 위험하다. 확신이 없을수록 confidence를 낮춰라.
- order_id는 소스마다 위치/형식이 다르다:
  - paper_receipt: 영수증 하단의 승인번호 (보통 6~12자리 숫자)
  - coupang/gmarket/11st: 주문번호 영역
  - baemin/coupang_eats: 주문ID/주문번호 (앱 상단·상세 화면)
- total_amount는 '총 결제금액' / '결제 금액' / '합계' 등의 최종 결제액. 부분합/할인 전 금액 아님.
- note에는 흐려서 못 읽은 부분, 의심스러운 점을 짧게 메모.

extract_receipt 도구를 정확히 한 번만 호출한다. 일반 텍스트 응답은 금지.`;

export const TOOL_NAME = "extract_receipt";
export const TOOL_DESCRIPTION =
  "영수증/주문 캡처 이미지에서 결제 정보(소스, 일시, 상호, 금액, 주문번호)를 구조화해 반환한다.";

// 명세서 v2 §3 — Sonnet 4.6 필수, Haiku 4.5 금지.
export const MODEL_ID = "claude-sonnet-4-6";
