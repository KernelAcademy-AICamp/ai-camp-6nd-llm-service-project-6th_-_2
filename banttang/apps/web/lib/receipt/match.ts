// 영수증 ↔ 파티 매칭 검증.
//
// 책임 분담:
//   - verify.ts (dedup)        : "이 영수증을 처음 쓰는지" — 재사용 방지
//   - match.ts  (이 파일)       : "이 영수증이 정말 이 파티의 거래인지" — 위조/오용 방지
//
// 4개 신호:
//   1. 카테고리 ↔ source_type    (delivery → baemin/coupang_eats/paper_receipt 등)
//   2. 상호명 유사도              (parties.store_name vs extraction.merchant)
//   3. 금액 비율                  (price_per_person * max_participants 대비)
//   4. 결제 시각 윈도              (deal_at 전후 -2h ~ +12h)
//
// 정책: 하나라도 실패하면 reject + reasons 반환. 임계값은 상단 상수로 분리.
// 호스트 본인 여부는 인증 레이어에서 별도 검증 (route.ts).

import { normalizeMerchant } from "./verify";
import type { ReceiptExtraction, SourceType } from "./schema";

// ─────────────────────────────────────────────────────────
// 임계값 (튜닝 가능)
// ─────────────────────────────────────────────────────────

// 카테고리별 허용 source_type
const ALLOWED_SOURCES: Record<PartyCategory, SourceType[]> = {
  delivery: ["baemin", "coupang_eats", "paper_receipt", "other"],
  offline_shopping: ["paper_receipt", "other"],
  online_shopping: ["coupang", "gmarket", "11st", "other"],
};

// 상호명 유사도 (0 ~ 1). OCR 노이즈 허용 위해 0.7로 시작.
const STORE_NAME_SIMILARITY_MIN = 0.7;

// 금액 비율. 예상 총액 = price_per_person * max_participants 대비.
// 0.7 미만 = 약속한 금액보다 많이 저렴 (배달 안 시키고 가짜?), 1.5 초과 = 과도하게 비쌈.
const AMOUNT_RATIO_MIN = 0.7;
const AMOUNT_RATIO_MAX = 1.5;

// 결제 시각 윈도 — deal_at(거래 예정 시각) 기준.
const PAID_AT_BEFORE_HOURS = 2; // 거래 예정 2시간 전부터는 인정 (선결제)
const PAID_AT_AFTER_HOURS = 12; // 거래 예정 12시간 이내

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type PartyCategory = "delivery" | "offline_shopping" | "online_shopping";

// route.ts에서 Supabase로 읽어와 넘기는 파티 데이터.
export interface PartyForMatch {
  id: string;
  category: PartyCategory;
  store_name: string;
  max_participants: number;
  price_per_person: number;
  deal_at: string; // ISO 8601
}

export interface MatchSignals {
  category_ok: boolean;
  store_name_similarity: number | null;
  amount_ratio: number | null;
  paid_at_offset_hours: number | null;
}

export type MatchResult =
  | { ok: true; signals: MatchSignals }
  | { ok: false; reasons: string[]; signals: MatchSignals };

// ─────────────────────────────────────────────────────────
// 유사도 — 정규화된 Levenshtein 비율
// ─────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}

// 정규화 후 1 - distance/maxLen.
function nameSimilarity(a: string, b: string): number {
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

// ─────────────────────────────────────────────────────────
// 매칭 함수
// ─────────────────────────────────────────────────────────

export function matchReceiptToParty(
  party: PartyForMatch,
  extraction: Pick<
    ReceiptExtraction,
    "source_type" | "merchant" | "total_amount" | "paid_at"
  >,
): MatchResult {
  const reasons: string[] = [];
  const signals: MatchSignals = {
    category_ok: false,
    store_name_similarity: null,
    amount_ratio: null,
    paid_at_offset_hours: null,
  };

  // 1. 카테고리 ↔ source_type
  const allowed = ALLOWED_SOURCES[party.category];
  signals.category_ok =
    !!extraction.source_type && allowed.includes(extraction.source_type);
  if (!signals.category_ok) {
    reasons.push(
      `카테고리 미스매치 (party=${party.category}, source=${extraction.source_type ?? "null"})`,
    );
  }

  // 2. 상호명 유사도
  if (extraction.merchant) {
    const sim = nameSimilarity(party.store_name, extraction.merchant);
    signals.store_name_similarity = Number(sim.toFixed(3));
    if (sim < STORE_NAME_SIMILARITY_MIN) {
      reasons.push(
        `상호 불일치 (유사도 ${sim.toFixed(2)}, 임계 ${STORE_NAME_SIMILARITY_MIN}) — party='${party.store_name}', receipt='${extraction.merchant}'`,
      );
    }
  } else {
    reasons.push("상호명 추출 실패 — 비교 불가");
  }

  // 3. 금액 비율
  const expectedTotal = party.price_per_person * party.max_participants;
  if (extraction.total_amount !== null && expectedTotal > 0) {
    const ratio = extraction.total_amount / expectedTotal;
    signals.amount_ratio = Number(ratio.toFixed(3));
    if (ratio < AMOUNT_RATIO_MIN || ratio > AMOUNT_RATIO_MAX) {
      reasons.push(
        `금액 이탈 (영수증 ${extraction.total_amount}원 / 예상 ${expectedTotal}원, 비율 ${ratio.toFixed(2)})`,
      );
    }
  } else if (extraction.total_amount === null) {
    reasons.push("영수증 금액 추출 실패");
  }

  // 4. 결제 시각 윈도
  if (extraction.paid_at) {
    const dealAt = new Date(party.deal_at).getTime();
    const paidAt = new Date(extraction.paid_at).getTime();
    if (Number.isNaN(dealAt) || Number.isNaN(paidAt)) {
      reasons.push("paid_at / deal_at 파싱 실패");
    } else {
      const offsetH = (paidAt - dealAt) / 3600000;
      signals.paid_at_offset_hours = Number(offsetH.toFixed(2));
      if (offsetH < -PAID_AT_BEFORE_HOURS || offsetH > PAID_AT_AFTER_HOURS) {
        reasons.push(
          `결제 시각 이탈 (deal_at 대비 ${offsetH.toFixed(1)}h, 윈도 [-${PAID_AT_BEFORE_HOURS}h, +${PAID_AT_AFTER_HOURS}h])`,
        );
      }
    }
  } else {
    reasons.push("paid_at 추출 실패");
  }

  if (reasons.length === 0) return { ok: true, signals };
  return { ok: false, reasons, signals };
}
