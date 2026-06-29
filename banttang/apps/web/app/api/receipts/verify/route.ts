// POST /api/receipts/verify — 영수증/주문 캡처 인증 엔드포인트
// 흐름 (명세서 v2 §4 → §2 → §5-3):
//   1. multipart parse + 사전 검증 (형식 / 크기)
//   2. sharp metadata 검증 (해상도) + 리사이즈 (긴 변 1568, JPEG 85)
//   3. 원본 sha256 계산 (logs용 지문)
//   4. Claude Vision 추출
//   5. is_receipt / 추출 신뢰도 게이트
//   6. dedup 키 도출 (메인 또는 폴백)
//   7. 사전 중복 조회 (빠른 409)
//   8. INSERT — race는 partial unique P2002로 차단
//   9. 모든 분기에서 redemption_logs에 한 줄 기록

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import sharp from "sharp";
import { Prisma, PrismaClient, RedemptionResult } from "@prisma/client";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/auth";
import { extractReceipt, type ExtractResult } from "@/lib/receipt/extract";
import {
  DUPLICATE_MESSAGES,
  checkDuplicate,
  deriveDedupKey,
  type DedupKey,
} from "@/lib/receipt/verify";
import {
  matchReceiptToParty,
  type PartyCategory,
  type PartyForMatch,
} from "@/lib/receipt/match";

// sharp는 Node 런타임 전용 (Edge runtime 사용 불가)
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────
// PrismaClient 싱글톤 — Next.js HMR에서 커넥션 누수 방지
// ─────────────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ─────────────────────────────────────────────────────────
// 명세서 §4 사전 검증 + §2 리사이즈 + 신뢰도 임계값
// ─────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_DIMENSION = 200;
const RESIZE_LONG_EDGE = 1568;
const JPEG_QUALITY = 85;

const IS_RECEIPT_THRESHOLD = 0.3;            // §4 항목 4
const EXTRACTION_CONFIDENCE_THRESHOLD = 0.6; // §5-6 — 수동 검토 경계 (조정 가능)

// ─────────────────────────────────────────────────────────
// 응답 모양
// ─────────────────────────────────────────────────────────
interface SuccessBody {
  ok: true;
  redemption: {
    id: string; // bigint → string (JSON 안전)
    source_type: string;
    order_id: string | null;
    total_amount: number;
    paid_at: string | null;
    created_at: string;
  };
}

interface ErrorBody {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

function jsonErr(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const body: ErrorBody = { ok: false, code, message, ...(details ? { details } : {}) };
  return NextResponse.json(body, { status, headers });
}

// 로그 실패는 본 흐름을 막지 않는다.
// UncheckedCreateInput: relation 객체 대신 raw FK 컬럼(`userId`) 직접 지정 가능.
async function writeLog(data: Prisma.RedemptionLogUncheckedCreateInput) {
  try {
    await prisma.redemptionLog.create({ data });
  } catch (e) {
    console.error("[receipt/verify] redemption_log write failed:", e);
  }
}

// ─────────────────────────────────────────────────────────
// Upstash rate limit — user_id당 1분 3회 (sliding window).
// 환경변수 미설정 시 비활성 (개발 편의). 운영에선 반드시 설정.
// ─────────────────────────────────────────────────────────
let _ratelimit: Ratelimit | null = null;
let _ratelimitChecked = false;
function getRatelimit(): Ratelimit | null {
  if (_ratelimitChecked) return _ratelimit;
  _ratelimitChecked = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn(
      "[receipt/verify] UPSTASH_REDIS_REST_URL/TOKEN 미설정 — rate limit 비활성",
    );
    return null;
  }
  _ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(3, "1 m"),
    prefix: "receipt:verify",
    analytics: true,
  });
  return _ratelimit;
}

// ─────────────────────────────────────────────────────────
// Slack 알림 — extraction_confidence가 임계값 미만일 때.
// SLACK_WEBHOOK_URL 미설정 시 no-op. 실패는 swallow.
// 3초 timeout으로 응답 지연 방지.
// ─────────────────────────────────────────────────────────
interface SlackLowConfidenceCtx {
  userId: bigint;
  modelUsed: string;
  extractionConfidence: number;
  isReceiptConfidence: number;
  sourceType: string | null;
  merchant: string | null;
  totalAmount: number | null;
  orderId: string | null;
  paidAt: string | null;
  note: string | null;
  imageSha256: string;
}

async function notifyLowConfidence(ctx: SlackLowConfidenceCtx) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const fields = [
      { type: "mrkdwn", text: `*User ID:*\n${ctx.userId.toString()}` },
      { type: "mrkdwn", text: `*Model:*\n${ctx.modelUsed}` },
      {
        type: "mrkdwn",
        text: `*extraction_confidence:*\n${ctx.extractionConfidence.toFixed(3)}`,
      },
      {
        type: "mrkdwn",
        text: `*is_receipt_confidence:*\n${ctx.isReceiptConfidence.toFixed(3)}`,
      },
      { type: "mrkdwn", text: `*소스:*\n${ctx.sourceType ?? "-"}` },
      { type: "mrkdwn", text: `*상호:*\n${ctx.merchant ?? "-"}` },
      {
        type: "mrkdwn",
        text: `*금액:*\n${ctx.totalAmount !== null ? `${ctx.totalAmount}원` : "-"}`,
      },
      { type: "mrkdwn", text: `*주문번호:*\n${ctx.orderId ?? "-"}` },
      { type: "mrkdwn", text: `*결제일시:*\n${ctx.paidAt ?? "-"}` },
    ];
    const blocks: unknown[] = [
      {
        type: "header",
        text: { type: "plain_text", text: "🟡 영수증 추출 신뢰도 낮음" },
      },
      { type: "section", fields },
    ];
    if (ctx.note) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*모델 메모:*\n>${ctx.note}` },
      });
    }
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `image_sha256: \`${ctx.imageSha256.slice(0, 16)}…\``,
        },
      ],
    });

    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "🟡 영수증 추출 신뢰도 낮음 — 수동 검토 필요",
        blocks,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    console.error("[receipt/verify] slack notify failed:", e);
  } finally {
    clearTimeout(timer);
  }
}

function asMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parseIsoToDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─────────────────────────────────────────────────────────
// POST /api/receipts/verify
// multipart/form-data: file (image), user_id (placeholder — auth 통합 전)
// ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  // 1. multipart parse
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    await writeLog({
      result: RedemptionResult.error,
      errorMessage: `multipart parse 실패: ${asMsg(e)}`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr("INVALID_REQUEST", "multipart 데이터를 읽지 못했어요.", 400);
  }

  const file = form.get("file");
  const partyIdRaw = form.get("party_id");

  if (!(file instanceof File)) {
    await writeLog({
      result: RedemptionResult.error,
      errorMessage: "file 필드 누락",
      durationMs: Date.now() - startedAt,
    });
    return jsonErr("INVALID_REQUEST", "file 필드가 필요합니다.", 400);
  }

  if (typeof partyIdRaw !== "string" || partyIdRaw.length === 0) {
    await writeLog({
      result: RedemptionResult.error,
      errorMessage: "party_id 필드 누락",
      durationMs: Date.now() - startedAt,
    });
    return jsonErr("INVALID_REQUEST", "party_id 필드가 필요합니다.", 400);
  }
  const partyId = partyIdRaw;

  // 1.5 인증 신원 → Prisma User upsert (UUID 키로 매핑)
  // 커스텀 쿠키(banttang_user_id) 우선 + 세션 폴백으로 신원을 얻는다.
  // Supabase auth.users(UUID)와 Prisma users(BIGINT) 사이를 supabase_user_id로 잇는다.
  const admin = createAdminClient();
  const authedUserId = await getAuthedUserId();
  if (!authedUserId) {
    return jsonErr("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  }
  // email은 best-effort — admin auth API로 조회(없어도 진행).
  let authedEmail: string | null = null;
  try {
    const { data: au } = await admin.auth.admin.getUserById(authedUserId);
    authedEmail = au?.user?.email ?? null;
  } catch {
    authedEmail = null;
  }
  let userId: bigint;
  try {
    const dbUser = await prisma.user.upsert({
      where: { supabaseUserId: authedUserId },
      update: { email: authedEmail },
      create: {
        supabaseUserId: authedUserId,
        email: authedEmail,
      },
      select: { id: true },
    });
    userId = dbUser.id;
  } catch (e) {
    await writeLog({
      result: RedemptionResult.error,
      errorMessage: `user upsert 실패: ${asMsg(e)}`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr("INTERNAL_ERROR", "사용자 정보를 처리하지 못했어요.", 500);
  }

  // 1.6 파티 조회 + 호스트 권한 검증
  // 영수증 인증은 호스트만 가능 — 멤버가 호스트 영수증을 멋대로 인증 못 함.
  const partyRes = await admin
    .from("parties")
    .select("id, host_id, category, store_name, max_participants, price_per_person, deal_at")
    .eq("id", partyId)
    .maybeSingle();
  if (partyRes.error || !partyRes.data) {
    await writeLog({
      userId,
      result: RedemptionResult.error,
      errorMessage: `party 조회 실패: ${partyRes.error?.message ?? "not found"}`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr("PARTY_NOT_FOUND", "파티를 찾지 못했어요.", 404);
  }
  const party = partyRes.data as {
    id: string;
    host_id: string;
    category: PartyCategory;
    store_name: string;
    max_participants: number;
    price_per_person: number;
    deal_at: string;
  };
  if (party.host_id !== authedUserId) {
    await writeLog({
      userId,
      result: RedemptionResult.error,
      errorMessage: `파티장 아님 (host=${party.host_id}, user=${authedUserId})`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr("FORBIDDEN", "파티장만 영수증을 인증할 수 있어요.", 403);
  }
  const partyForMatch: PartyForMatch = {
    id: party.id,
    category: party.category,
    store_name: party.store_name,
    max_participants: party.max_participants,
    price_per_person: party.price_per_person,
    deal_at: party.deal_at,
  };

  // 1.5 Rate limit — user_id당 1분 3회. Upstash 미설정이면 skip.
  // 비싼 작업(sharp + Claude API) 전에 차단해서 비용/부담 절감.
  // Upstash 호출 자체가 실패하면 fail-open (경고 로그만 남기고 진행).
  const rl = getRatelimit();
  if (rl) {
    try {
      const { success, limit, remaining, reset } = await rl.limit(
        `u:${userId.toString()}`,
      );
      if (!success) {
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
        await writeLog({
          userId,
          result: RedemptionResult.error,
          errorMessage: `rate_limited (limit=${limit}, remaining=${remaining}, retry=${retryAfter}s)`,
          durationMs: Date.now() - startedAt,
        });
        return jsonErr(
          "RATE_LIMITED",
          "잠시 후 다시 시도해주세요.",
          429,
          { retry_after_seconds: retryAfter, limit, remaining },
          { "Retry-After": String(retryAfter) },
        );
      }
    } catch (e) {
      console.error("[receipt/verify] rate limit check failed (fail-open):", e);
    }
  }

  // 2. 파일 형식/크기 검증 (§4)
  if (!ALLOWED_MIME.has(file.type)) {
    await writeLog({
      userId,
      result: RedemptionResult.error,
      errorMessage: `허용되지 않은 형식: ${file.type || "(unknown)"}`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr(
      "INVALID_FORMAT",
      "지원하지 않는 형식입니다. (jpg, png, webp, heic만 가능)",
      400,
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    await writeLog({
      userId,
      result: RedemptionResult.error,
      errorMessage: `파일 크기 초과: ${sizeMb}MB / 최대 10MB`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr(
      "FILE_TOO_LARGE",
      `파일이 너무 큽니다 (${sizeMb}MB / 최대 10MB)`,
      400,
    );
  }

  // 3. sha256 + 메타 검증 + 리사이즈 (§2)
  const originalBytes = Buffer.from(await file.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(originalBytes).digest("hex");

  let resizedBytes: Buffer;
  try {
    const img = sharp(originalBytes);
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;

    if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
      await writeLog({
        userId,
        result: RedemptionResult.error,
        imageSha256: sha256,
        errorMessage: `해상도 미달: ${w}x${h}`,
        durationMs: Date.now() - startedAt,
      });
      return jsonErr(
        "IMAGE_TOO_SMALL",
        "사진이 너무 작아요. 더 크게 다시 찍어주세요.",
        400,
      );
    }

    // EXIF orientation 반영 + 긴 변 1568로 inside-fit + JPEG q=85
    resizedBytes = await img
      .rotate()
      .resize({
        width: RESIZE_LONG_EDGE,
        height: RESIZE_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch (e) {
    await writeLog({
      userId,
      result: RedemptionResult.error,
      imageSha256: sha256,
      errorMessage: `리사이즈 실패: ${asMsg(e)}`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr("RESIZE_FAILED", "이미지 처리에 실패했어요.", 500);
  }

  // 4. Claude Vision 추출
  const extractResult: ExtractResult = await extractReceipt({
    imageBase64: resizedBytes.toString("base64"),
    mediaType: "image/jpeg",
  });

  if (!extractResult.ok) {
    const result =
      extractResult.reason === "api_error"
        ? RedemptionResult.error
        : RedemptionResult.extract_failed;
    await writeLog({
      userId,
      result,
      imageSha256: sha256,
      modelUsed: extractResult.modelUsed,
      errorMessage: `${extractResult.reason}: ${extractResult.message}`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr(
      "EXTRACTION_FAILED",
      "이미지에서 정보를 읽지 못했어요. 다시 시도해주세요.",
      502,
    );
  }

  const extraction = extractResult.data;

  // 5-a. is_receipt 게이트 (§4 항목 4)
  if (
    !extraction.is_receipt ||
    extraction.is_receipt_confidence < IS_RECEIPT_THRESHOLD
  ) {
    await writeLog({
      userId,
      result: RedemptionResult.not_receipt,
      sourceType: extraction.source_type,
      isReceiptConfidence: extraction.is_receipt_confidence,
      extractionConfidence: extraction.extraction_confidence,
      modelUsed: extractResult.modelUsed,
      imageSha256: sha256,
      errorMessage: extraction.note ?? undefined,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr(
      "NOT_RECEIPT",
      "영수증으로 인식되지 않았어요. 수기 입력으로 진행해주세요.",
      422,
      { is_receipt_confidence: extraction.is_receipt_confidence },
    );
  }

  // 5-b. 추출 신뢰도 게이트 (§5-6 — 수동 검토) + Slack 알림
  if (extraction.extraction_confidence < EXTRACTION_CONFIDENCE_THRESHOLD) {
    await writeLog({
      userId,
      result: RedemptionResult.low_confidence,
      sourceType: extraction.source_type,
      orderId: extraction.order_id,
      totalAmount: extraction.total_amount,
      paidAt: parseIsoToDate(extraction.paid_at),
      isReceiptConfidence: extraction.is_receipt_confidence,
      extractionConfidence: extraction.extraction_confidence,
      modelUsed: extractResult.modelUsed,
      imageSha256: sha256,
      errorMessage: extraction.note ?? undefined,
      durationMs: Date.now() - startedAt,
    });
    await notifyLowConfidence({
      userId,
      modelUsed: extractResult.modelUsed,
      extractionConfidence: extraction.extraction_confidence,
      isReceiptConfidence: extraction.is_receipt_confidence,
      sourceType: extraction.source_type,
      merchant: extraction.merchant,
      totalAmount: extraction.total_amount,
      orderId: extraction.order_id,
      paidAt: extraction.paid_at,
      note: extraction.note,
      imageSha256: sha256,
    });
    return jsonErr(
      "LOW_CONFIDENCE",
      "추출 신뢰도가 낮아요. 수기 입력으로 진행해주세요.",
      422,
      { extraction_confidence: extraction.extraction_confidence },
    );
  }

  // 6. dedup 키 도출 (메인 또는 폴백)
  const keyResult = deriveDedupKey(extraction);
  if (!keyResult.ok) {
    await writeLog({
      userId,
      result: RedemptionResult.low_confidence,
      sourceType: extraction.source_type,
      orderId: extraction.order_id,
      totalAmount: extraction.total_amount,
      paidAt: parseIsoToDate(extraction.paid_at),
      isReceiptConfidence: extraction.is_receipt_confidence,
      extractionConfidence: extraction.extraction_confidence,
      modelUsed: extractResult.modelUsed,
      imageSha256: sha256,
      errorMessage: `dedup 키 도출 실패: ${keyResult.reason} — ${keyResult.message}`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr(
      "NO_DEDUP_FIELDS",
      "결제 정보를 충분히 읽지 못했어요. 수기 입력으로 진행해주세요.",
      422,
      { reason: keyResult.reason },
    );
  }

  // total_amount는 receipt_redemptions에서 NOT NULL — 도달했어도 한 번 더 보호
  if (extraction.total_amount === null) {
    await writeLog({
      userId,
      result: RedemptionResult.low_confidence,
      sourceType: extraction.source_type,
      orderId: extraction.order_id,
      isReceiptConfidence: extraction.is_receipt_confidence,
      extractionConfidence: extraction.extraction_confidence,
      modelUsed: extractResult.modelUsed,
      imageSha256: sha256,
      errorMessage: "total_amount 누락 — INSERT 불가",
      durationMs: Date.now() - startedAt,
    });
    return jsonErr(
      "LOW_CONFIDENCE",
      "금액을 읽지 못했어요. 수기 입력으로 진행해주세요.",
      422,
    );
  }

  // INSERT용 값 정리
  const key: DedupKey = keyResult.key;
  const orderIdForRow = key.kind === "main" ? key.orderId : null;
  const fallbackKeyForRow = key.kind === "fallback" ? key.fallbackKey : null;
  // deriveDedupKey가 source_type 검증 완료 — non-null assertion
  const sourceType = extraction.source_type!;
  const paidAtDate = parseIsoToDate(extraction.paid_at);
  const totalAmount = extraction.total_amount;

  // 7. 사전 중복 조회 → 빠른 409
  const dupCheck = await checkDuplicate(prisma, key);
  if (dupCheck.duplicate) {
    await writeLog({
      userId,
      result: RedemptionResult.duplicate,
      sourceType,
      orderId: orderIdForRow,
      fallbackKey: fallbackKeyForRow,
      totalAmount,
      paidAt: paidAtDate,
      isReceiptConfidence: extraction.is_receipt_confidence,
      extractionConfidence: extraction.extraction_confidence,
      modelUsed: extractResult.modelUsed,
      imageSha256: sha256,
      errorMessage: `중복: existing_id=${dupCheck.existing.id}`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr("ALREADY_REDEEMED", dupCheck.message, 409);
  }

  // 7.5 영수증 ↔ 파티 매칭 검증 (위조/오용 방지)
  // dedup이 "처음 쓰는지"를 막는다면, match는 "정말 이 파티 거래인지"를 막는다.
  const matchResult = matchReceiptToParty(partyForMatch, extraction);
  if (!matchResult.ok) {
    await writeLog({
      userId,
      result: RedemptionResult.low_confidence,
      sourceType,
      orderId: orderIdForRow,
      fallbackKey: fallbackKeyForRow,
      totalAmount,
      paidAt: paidAtDate,
      isReceiptConfidence: extraction.is_receipt_confidence,
      extractionConfidence: extraction.extraction_confidence,
      modelUsed: extractResult.modelUsed,
      imageSha256: sha256,
      errorMessage: `match 실패: ${matchResult.reasons.join(" | ")} (signals=${JSON.stringify(matchResult.signals)})`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr(
      "PARTY_MISMATCH",
      "영수증이 이 파티의 거래와 일치하지 않아요. 올바른 영수증인지 확인해주세요.",
      422,
      { reasons: matchResult.reasons, signals: matchResult.signals },
    );
  }

  // 8. INSERT — race는 partial unique P2002로 차단됨
  let row: { id: bigint; createdAt: Date };
  try {
    row = await prisma.receiptRedemption.create({
      data: {
        userId,
        sourceType,
        orderId: orderIdForRow,
        fallbackKey: fallbackKeyForRow,
        totalAmount,
        paidAt: paidAtDate,
      } satisfies Prisma.ReceiptRedemptionUncheckedCreateInput,
      select: { id: true, createdAt: true },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      await writeLog({
        userId,
        result: RedemptionResult.duplicate,
        sourceType,
        orderId: orderIdForRow,
        fallbackKey: fallbackKeyForRow,
        totalAmount,
        paidAt: paidAtDate,
        isReceiptConfidence: extraction.is_receipt_confidence,
        extractionConfidence: extraction.extraction_confidence,
        modelUsed: extractResult.modelUsed,
        imageSha256: sha256,
        errorMessage: "race 중복: P2002 partial unique violation",
        durationMs: Date.now() - startedAt,
      });
      return jsonErr("ALREADY_REDEEMED", DUPLICATE_MESSAGES[key.kind], 409);
    }
    await writeLog({
      userId,
      result: RedemptionResult.error,
      sourceType,
      orderId: orderIdForRow,
      fallbackKey: fallbackKeyForRow,
      totalAmount,
      paidAt: paidAtDate,
      modelUsed: extractResult.modelUsed,
      imageSha256: sha256,
      errorMessage: `INSERT 실패: ${asMsg(e)}`,
      durationMs: Date.now() - startedAt,
    });
    return jsonErr("INTERNAL_ERROR", "저장에 실패했어요.", 500);
  }

  // 9. 성공 로그 + 응답
  await writeLog({
    userId,
    result: RedemptionResult.success,
    sourceType,
    orderId: orderIdForRow,
    fallbackKey: fallbackKeyForRow,
    totalAmount,
    paidAt: paidAtDate,
    isReceiptConfidence: extraction.is_receipt_confidence,
    extractionConfidence: extraction.extraction_confidence,
    modelUsed: extractResult.modelUsed,
    imageSha256: sha256,
    durationMs: Date.now() - startedAt,
  });

  const body: SuccessBody = {
    ok: true,
    redemption: {
      id: row.id.toString(),
      source_type: sourceType,
      order_id: orderIdForRow,
      total_amount: totalAmount,
      paid_at: extraction.paid_at,
      created_at: row.createdAt.toISOString(),
    },
  };
  return NextResponse.json(body, { status: 200 });
}
