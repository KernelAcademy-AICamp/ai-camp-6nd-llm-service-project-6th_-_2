"use server";

// 영수증 검증 — Claude Vision으로 직접 이미지 분석.
// 실제 종이 영수증 + 쿠팡/G마켓/11번가/배민 등 결제 화면 캡처 모두 지원.
// FastAPI 없이 Next.js server action만으로 동작.
//
// 흐름:
//   1) 호스트 권한 + 입력 검증
//   2) Claude Sonnet 4.6 (vision)에 이미지 + 메타 전달 → JSON 응답 파싱
//   3) verified면:
//      a. receipts bucket에 이미지 업로드 (admin)
//      b. receipts row INSERT (final_*는 Claude가 추출한 값 우선, 사용자 입력으로 보정)
//      c. parties.status closed → in_progress
//      d. 채팅방에 receipt_card 시스템 메시지 INSERT
//   4) 실패면 422 + 사유 반환 (row 미생성)

import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SUPPORTED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const SYSTEM_PROMPT = `너는 한국 결제 영수증/주문 내역 검증 시스템이다.

사용자가 올린 이미지를 분석해 결제 사실을 확인한다. 이미지는 다음 중 하나일 수 있다:
- 종이 영수증(POS, 카드 영수증, 매장 영수증)
- 카드사 앱·문자 결제 알림 캡처
- 쇼핑 앱 결제완료 화면(쿠팡, G마켓, 11번가, 네이버페이, 배달의민족, 요기요, 카카오페이 등)
- 송금/이체 화면(카카오뱅크, 토스 등)

다음을 추출/판단한다:
1. 가게/상점/판매자 이름(merchant)
2. 결제 총액(detected_total) — 원화 정수 (콤마 제거)
3. 결제 일시(detected_paid_at) — 가능하면 ISO 8601 형식 (YYYY-MM-DDTHH:MM:SS+09:00)
4. 신고 금액(expected_total)과 일치 여부 (오차 ±10원 허용)
5. 위·변조 의심 신호(중복 텍스트, 어색한 폰트, 누락된 필수 정보 등)

반드시 JSON 한 객체로만 답한다 (코드블록·설명·앞뒤 텍스트 금지):
{
  "verified": boolean,
  "reason": "한국어 한 문장 사유 (또는 실패 이유)",
  "merchant": string | null,
  "detected_total": integer | null,
  "detected_paid_at": "YYYY-MM-DDTHH:MM:SS+09:00" | null,
  "confidence": 0.0 ~ 1.0,
  "document_type": "paper_receipt" | "card_notification" | "shopping_app" | "transfer" | "unknown"
}

verified 기준:
- detected_total이 expected_total과 일치(±10원) → verified=true
- 명백히 결제 화면이 아니거나(셀카, 풍경 등) → verified=false
- 결제 화면이지만 금액 추출 불가 → verified=false, reason 명시
- 의심 신호 강함 → verified=false
`;

interface VerifyOutput {
  verified: boolean;
  reason: string;
  merchant: string | null;
  detected_total: number | null;
  detected_paid_at: string | null;
  confidence: number;
  document_type: string;
}

export interface VerifyReceiptResult {
  verified: boolean;
  reason: string;
  confidence: number;
  receipt_id?: string;
  merchant?: string | null;
  detected_total?: number | null;
}

export async function verifyReceiptWithClaude(
  formData: FormData,
): Promise<
  | { ok: true; data: VerifyReceiptResult }
  | { ok: false; error: string }
> {
  try {
    // 1) 입력
    const file = formData.get("file");
    const partyIdRaw = formData.get("party_id");
    const totalAmountRaw = formData.get("total_amount");
    if (!(file instanceof File)) return { ok: false, error: "사진이 없어요." };
    if (typeof partyIdRaw !== "string" || !partyIdRaw) {
      return { ok: false, error: "party_id가 없어요." };
    }
    const expectedTotal = Number(totalAmountRaw);
    if (!Number.isInteger(expectedTotal) || expectedTotal <= 0) {
      return { ok: false, error: "결제 금액을 정확히 입력해주세요." };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: "사진이 너무 커요. 10MB 이하로 다시 올려주세요." };
    }
    if (!ACCEPTED.has(file.type)) {
      return { ok: false, error: "사진 파일(JPG, PNG, WEBP)로 올려주세요." };
    }

    // 2) 호스트 권한 검증
    const supabase = createServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return { ok: false, error: "로그인이 필요해요." };

    const admin = createAdminClient();
    const { data: party, error: partyErr } = await admin
      .from("parties")
      .select("id, host_id, store_name, status")
      .eq("id", partyIdRaw)
      .maybeSingle();
    if (partyErr || !party) return { ok: false, error: "파티를 찾을 수 없어요." };
    if (party.host_id !== auth.user.id) {
      return { ok: false, error: "호스트만 영수증을 등록할 수 있어요." };
    }

    // 3) Claude API 키 확인
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "검증 서비스 설정이 비어있어요. 관리자에게 문의해주세요." };
    }

    // 4) 이미지 base64 변환 + Claude 호출
    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");
    const mediaType = SUPPORTED_MEDIA.has(file.type) ? file.type : "image/jpeg";

    const client = new Anthropic({ apiKey });
    let verdict: VerifyOutput;
    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                  data: base64,
                },
              },
              {
                type: "text",
                text: `신고 금액: ${expectedTotal}원\n가게(파티 등록 시): ${party.store_name}\n\n이 이미지를 분석해 위 JSON 스키마로만 답해줘.`,
              },
            ],
          },
        ],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return { ok: false, error: "응답을 받지 못했어요. 잠시 후 다시 시도해주세요." };
      }
      verdict = parseJsonStrict(textBlock.text);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? `검증 호출 실패: ${err.message}`
            : "검증 호출 실패",
      };
    }

    if (!verdict.verified) {
      return {
        ok: true,
        data: {
          verified: false,
          reason: verdict.reason || "영수증을 인증하지 못했어요.",
          confidence: verdict.confidence ?? 0,
          merchant: verdict.merchant,
          detected_total: verdict.detected_total,
        },
      };
    }

    // 5) 검증 성공 → Storage 업로드 + DB INSERT
    const receiptId = randomUUID();
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const storagePath = `${partyIdRaw}/${receiptId}.${ext}`;
    const upload = await admin.storage
      .from("receipts")
      .upload(storagePath, buf, { contentType: file.type, upsert: false });
    if (upload.error) {
      return { ok: false, error: `사진 업로드 실패: ${upload.error.message}` };
    }

    // approved 참여자 수로 1인당 금액 계산
    const { data: parts, error: partsErr } = await admin
      .from("party_participants")
      .select("id")
      .eq("party_id", partyIdRaw)
      .eq("status", "approved");
    if (partsErr) return { ok: false, error: partsErr.message };
    const approvedCount = parts?.length ?? 0;
    const pricePerPerson =
      approvedCount > 0 ? Math.round(expectedTotal / approvedCount) : null;

    const nowIso = new Date().toISOString();
    const finalStoreName = verdict.merchant || party.store_name || "미상";
    const finalPaidAt = verdict.detected_paid_at || nowIso;

    const { data: inserted, error: insErr } = await admin
      .from("receipts")
      .insert({
        id: receiptId,
        party_id: partyIdRaw,
        uploader_id: auth.user.id,
        storage_path: storagePath,
        ocr_store_name: verdict.merchant,
        ocr_total_amount: verdict.detected_total,
        ocr_confidence: verdict.confidence,
        final_store_name: finalStoreName,
        final_total_amount: expectedTotal,
        final_paid_at: finalPaidAt,
        price_per_person: pricePerPerson,
        shared_to_chat_at: nowIso,
      })
      .select("id")
      .single();
    if (insErr) return { ok: false, error: `영수증 저장 실패: ${insErr.message}` };

    // parties.status closed → in_progress
    await admin
      .from("parties")
      .update({ status: "in_progress" })
      .eq("id", partyIdRaw)
      .eq("status", "closed");

    // 채팅방 receipt_card 시스템 메시지
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", partyIdRaw)
      .maybeSingle();
    if (room) {
      await admin.from("chat_messages").insert({
        room_id: room.id,
        sender_id: null,
        type: "receipt_card",
        system_event: "receipt_uploaded",
        content: `${finalStoreName} · ${expectedTotal.toLocaleString("ko-KR")}원 영수증이 등록되었어요.`,
        metadata: { receipt_id: inserted.id, amount: expectedTotal },
      });
    }

    return {
      ok: true,
      data: {
        verified: true,
        reason: verdict.reason || "영수증 인증을 완료했어요.",
        confidence: verdict.confidence ?? 0.9,
        receipt_id: inserted.id,
        merchant: verdict.merchant,
        detected_total: verdict.detected_total,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "검증 중 오류가 발생했어요.",
    };
  }
}

// Claude가 JSON만 답하지만 가끔 앞뒤 텍스트/코드블록이 섞일 수 있어 관대하게 파싱.
function parseJsonStrict(text: string): VerifyOutput {
  // 코드블록 ```json ... ``` 안에 있으면 추출
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : text).trim();
  // 첫 { ~ 마지막 } 사이만 추출
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) {
    throw new Error("응답에 JSON이 없어요");
  }
  const json = raw.slice(start, end + 1);
  const parsed = JSON.parse(json) as Partial<VerifyOutput>;
  return {
    verified: !!parsed.verified,
    reason: parsed.reason || "",
    merchant: parsed.merchant ?? null,
    detected_total:
      typeof parsed.detected_total === "number"
        ? parsed.detected_total
        : parsed.detected_total != null
          ? Number(parsed.detected_total) || null
          : null,
    detected_paid_at: parsed.detected_paid_at ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    document_type: (parsed.document_type as string) || "unknown",
  };
}
