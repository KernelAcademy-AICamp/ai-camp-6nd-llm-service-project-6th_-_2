"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatKrw } from "@/lib/utils";
import type { UserProfile } from "@/lib/types/domain";

// F403 — 붐업(긍정) / 붐따(부정) 이진 평가
export type Rating = "good" | "bad";

export interface ParticipantReviewInput {
  reviewee_id: string;
  rating: Rating;
  // 붐따(F404)일 때만 5~200자 사유. 붐업이면 null.
  reason: string | null;
}

export interface CompleteSubmitInput {
  reviews: ParticipantReviewInput[];
  // 멤버 시점: 호스트에게 부담한 금액(F402). 호스트는 정산 입력이 없으므로 undefined.
  my_paid_amount?: number;
  // 호스트가 동시에 거래 완료(parties.status='completed')도 트리거.
  also_complete_transaction: boolean;
}

interface Participant extends Pick<UserProfile, "id" | "nickname"> {
  is_host: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  // 평가 대상자(자기 자신 제외)
  participants: Participant[];
  currentUserId: string;
  // 호스트 시점인지: 호스트면 거래 완료 처리 + 평가 동시에, 멤버면 평가만
  isHost: boolean;
  // 멤버 시점 — 영수증 기반 1인당 금액(있으면 input의 default + 차이 검증 기준).
  suggestedAmount?: number;
  // 영수증 인증 총액(호스트 화면 정산 안내용, 멤버 시점에서도 차이 비교 표시).
  verifiedTotal?: number;
  onSubmit: (input: CompleteSubmitInput) => Promise<void>;
}

const REASON_MIN = 5;
const REASON_MAX = 200;
const AMOUNT_MAX = 10_000_000;

// 명세서 4장 — 거래 확인 팝업(F401).
// 멤버: 부담 금액(F402) + 함께한 분 평가(F403~F404).
// 호스트: 평가 + 거래 완료 처리.
export function CompleteSheet({
  open,
  onClose,
  participants,
  currentUserId,
  isHost,
  suggestedAmount,
  verifiedTotal,
  onSubmit,
}: Props) {
  const others = useMemo(
    () => participants.filter((p) => p.id !== currentUserId),
    [participants, currentUserId],
  );
  const host = others.find((p) => p.is_host) ?? null;

  const [ratings, setRatings] = useState<Record<string, Rating | undefined>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 시트 열릴 때 기본값 채우고, 닫힐 때 상태 초기화
  useEffect(() => {
    if (open) {
      setError(null);
      if (suggestedAmount && !amount) {
        setAmount(String(suggestedAmount));
      }
    } else {
      setRatings({});
      setReasons({});
      setAmount("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const showAmountInput = !isHost && host !== null;
  const numericAmount = Number(amount.replace(/[^\d]/g, ""));
  const amountValid =
    !showAmountInput ||
    (numericAmount >= 1 && numericAmount <= AMOUNT_MAX);

  // 인증 금액과 차이가 큰지(20% 이상) — A402: 경고만, 제출은 허용
  const amountWarn =
    showAmountInput &&
    amountValid &&
    suggestedAmount &&
    Math.abs(numericAmount - suggestedAmount) > suggestedAmount * 0.2;

  const allRated = others.every((p) => ratings[p.id]);
  const allReasonsValid = others.every((p) => {
    if (ratings[p.id] !== "bad") return true;
    const r = (reasons[p.id] ?? "").trim();
    return r.length >= REASON_MIN && r.length <= REASON_MAX;
  });

  const canSubmit = allRated && allReasonsValid && amountValid && !submitting;

  function setRating(id: string, r: Rating) {
    setRatings((prev) => ({ ...prev, [id]: r }));
    if (r === "good") {
      // 붐업 전환 시 사유 자동 비우기(아예 안 보내짐)
      setReasons((prev) => ({ ...prev, [id]: "" }));
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!allRated) return setError("모든 참여자를 평가해주세요.");
    if (!allReasonsValid)
      return setError(`붐따 사유를 ${REASON_MIN}자 이상 작성해주세요.`);
    if (!amountValid) return setError("금액을 정확히 입력해주세요.");

    setSubmitting(true);
    try {
      await onSubmit({
        reviews: others.map((p): ParticipantReviewInput => {
          const r = ratings[p.id]!;
          return {
            reviewee_id: p.id,
            rating: r,
            reason: r === "bad" ? (reasons[p.id] ?? "").trim() : null,
          };
        }),
        my_paid_amount: showAmountInput ? numericAmount : undefined,
        also_complete_transaction: isHost,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "제출에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title="반띵 확인"
      maxHeightPct={92}
    >
      <div className="flex flex-col gap-5 p-4 pb-6">
        <div>
          <p className="text-[15px] font-bold text-gray-900">반띵 시간이에요!</p>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {isHost
              ? "거래를 마무리하고 함께한 분들을 평가해주세요."
              : "호스트에게 보낸 금액과 함께한 분 평가를 남겨주세요."}
          </p>
        </div>

        {/* F402 — 멤버 시점: 호스트에게 부담한 금액 */}
        {showAmountInput && host && (
          <section className="rounded-2xl bg-brand/[0.06] p-4 ring-1 ring-brand/20">
            <p className="text-[12px] text-gray-500">호스트에게 송금</p>
            <p className="mt-0.5 text-[13px]">
              <span className="font-semibold text-gray-900">{host.nickname}</span>
              {suggestedAmount ? (
                <span className="ml-1 text-gray-500">
                  · 권장 {formatKrw(suggestedAmount)}
                </span>
              ) : null}
            </p>
            <div className="mt-3 flex items-baseline gap-1 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-black/[0.06] focus-within:ring-2 focus-within:ring-brand/40">
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d]/g, ""));
                  if (error) setError(null);
                }}
                aria-label="송금 금액"
                placeholder="0"
                className="flex-1 bg-transparent text-right text-[18px] font-bold tabular-nums text-gray-900 outline-none placeholder:text-gray-300"
              />
              <span className="text-[14px] font-semibold text-gray-500">원</span>
            </div>
            {amountWarn && (
              <p className="mt-2 text-[12px] text-amber-700">
                ⚠ 인증 금액과 차이가 커요. 다시 확인해주세요.
              </p>
            )}
            {verifiedTotal && (
              <p className="mt-2 text-[11px] text-gray-400">
                참고: 인증된 총 결제 금액 {formatKrw(verifiedTotal)}
              </p>
            )}
          </section>
        )}

        {/* F403 + F404 — 함께한 분 평가 */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] font-bold text-gray-900">
            함께한 분 평가
          </h3>
          <ul className="flex flex-col gap-2">
            {others.map((p) => {
              const r = ratings[p.id];
              const reason = reasons[p.id] ?? "";
              const reasonLen = reason.trim().length;
              const reasonInvalid =
                r === "bad" && (reasonLen < REASON_MIN || reasonLen > REASON_MAX);
              return (
                <li
                  key={p.id}
                  className="rounded-2xl bg-white p-3 ring-1 ring-black/[0.06]"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar nickname={p.nickname} size={36} />
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold text-gray-900">
                        {p.nickname}
                        {p.is_host && (
                          <span className="ml-1 text-[11px] font-medium text-brand">
                            호스트
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRating(p.id, "good")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-bold transition-colors",
                        r === "good"
                          ? "bg-brand text-white"
                          : "bg-gray-100 text-gray-600 active:bg-gray-200",
                      )}
                      aria-pressed={r === "good"}
                    >
                      👍 붐업
                    </button>
                    <button
                      type="button"
                      onClick={() => setRating(p.id, "bad")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-bold transition-colors",
                        r === "bad"
                          ? "bg-rose-500 text-white"
                          : "bg-gray-100 text-gray-600 active:bg-gray-200",
                      )}
                      aria-pressed={r === "bad"}
                    >
                      👎 붐따
                    </button>
                  </div>

                  {r === "bad" && (
                    <div className="mt-2">
                      <textarea
                        value={reason}
                        onChange={(e) =>
                          setReasons((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        maxLength={REASON_MAX}
                        rows={2}
                        placeholder={`어떤 점이 아쉬웠나요? ${REASON_MIN}자 이상 적어주세요.`}
                        className={cn(
                          "w-full resize-none rounded-xl bg-gray-50 p-2.5 text-[13px] leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none",
                          "ring-1 focus:ring-2",
                          reasonInvalid && reasonLen > 0
                            ? "ring-rose-300 focus:ring-rose-400"
                            : "ring-black/[0.06] focus:ring-brand/40",
                        )}
                      />
                      <div className="mt-1 flex items-center justify-between px-0.5">
                        <span
                          className={cn(
                            "text-[11px]",
                            reasonInvalid && reasonLen > 0
                              ? "text-rose-600"
                              : "text-transparent",
                          )}
                        >
                          {reasonLen < REASON_MIN
                            ? `최소 ${REASON_MIN}자 이상`
                            : ""}
                          .
                        </span>
                        <span
                          className={cn(
                            "text-[11px] tabular-nums",
                            reasonLen > REASON_MAX
                              ? "text-rose-600"
                              : "text-gray-400",
                          )}
                        >
                          {reasonLen}/{REASON_MAX}
                        </span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {error && (
          <p className="text-center text-[13px] font-medium text-rose-600">
            {error}
          </p>
        )}
      </div>

      {/* sticky 제출 버튼 */}
      <div className="sticky bottom-0 border-t border-black/[0.06] bg-white px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            "h-12 w-full rounded-xl text-[15px] font-bold transition-opacity",
            canSubmit
              ? "bg-brand text-white active:opacity-80"
              : "bg-gray-200 text-gray-400",
          )}
        >
          {submitting ? "제출 중..." : isHost ? "거래 완료" : "제출"}
        </button>
      </div>
    </Sheet>
  );
}
