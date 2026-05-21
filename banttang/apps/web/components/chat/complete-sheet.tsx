"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatKrw } from "@/lib/utils";
import type { UserProfile } from "@/lib/types/domain";

export type BinaryRating = "good" | "bad";

export interface MemberReviewInput {
  reviewee_id: string;
  rating: BinaryRating;
}

export interface HostReviewInput {
  reviewee_id: string;
  // 호스트만 별점 1~5 + 한 줄 평
  stars: number;
  comment: string;
}

export interface CompleteSubmitInput {
  member_reviews: MemberReviewInput[];
  host_review: HostReviewInput | null;
  // 호스트가 거래 완료 처리도 트리거하는 경우 true
  also_complete_transaction: boolean;
}

interface Participant extends Pick<UserProfile, "id" | "nickname"> {
  is_host: boolean;
  // 이 거래에서 정산할 1인당 금액 (호스트에게 송금할 금액 안내용)
  share_amount?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  // 평가 대상자(자기 자신 제외)
  participants: Participant[];
  currentUserId: string;
  // 호스트 시점인지: 호스트면 거래 완료 처리 + 평가 동시에, 멤버면 평가만
  isHost: boolean;
  // 멤버 시점에서 호스트에게 송금할 금액 (1인당 금액). 없으면 송금 카드 숨김.
  hostShareAmount?: number;
  onSubmit: (input: CompleteSubmitInput) => Promise<void>;
}

// 와이어프레임 10 기반: 멤버는 [좋았어요/별로] 이진 평가, 호스트는 별점+한줄평,
// 멤버 시점일 때 "호스트에게 송금 11,000원 카카오톡 송금 바로가기" 카드.
export function CompleteSheet({
  open,
  onClose,
  participants,
  currentUserId,
  isHost,
  hostShareAmount,
  onSubmit,
}: Props) {
  const others = participants.filter((p) => p.id !== currentUserId);
  const host = others.find((p) => p.is_host) ?? null;
  const nonHosts = others.filter((p) => !p.is_host);

  const [memberRatings, setMemberRatings] = useState<Record<string, BinaryRating>>({});
  const [hostStars, setHostStars] = useState(0);
  const [hostComment, setHostComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMemberRatings({});
      setHostStars(0);
      setHostComment("");
      setError(null);
    }
  }, [open]);

  // 멤버 시점: 호스트는 별점/한줄평이 필요, 나머지 멤버는 좋았어요/별로
  // 호스트 시점: 모든 다른 사람을 좋았어요/별로로 평가 (자기 자신은 평가 X)
  const showHostBlock = !isHost && host !== null;
  const showMemberBlock = nonHosts.length > 0 || isHost;

  // 호스트 시점에서는 모든 others가 멤버 평가 대상
  const memberTargets = isHost ? others : nonHosts;

  const allRated =
    memberTargets.every((p) => memberRatings[p.id]) &&
    (!showHostBlock || hostStars > 0);

  async function handleSubmit() {
    if (!allRated) {
      setError("모든 항목을 평가해주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        member_reviews: memberTargets.map((p) => ({
          reviewee_id: p.id,
          rating: memberRatings[p.id],
        })),
        host_review:
          showHostBlock && host
            ? { reviewee_id: host.id, stars: hostStars, comment: hostComment.trim() }
            : null,
        also_complete_transaction: isHost,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSendMoney() {
    if (!host || !hostShareAmount) return;
    // 실제로는 카카오톡 송금 딥링크 또는 토스 송금 URL로 이동.
    // 데모/MVP에서는 안내 alert.
    alert(
      `[송금 안내] ${host.nickname}님에게 ${formatKrw(hostShareAmount)} 송금을 진행해주세요.\n` +
        `실제 서비스에서는 카카오톡 송금 화면으로 바로 이동합니다.`,
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={isHost ? "거래 완료 · 평가" : "함께한 분 평가"}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-center text-sm font-medium">거래는 어땠나요?</p>
        <p className="-mt-2 text-center text-xs text-foreground/60">
          함께한 분들을 평가해주세요.
        </p>

        {/* 멤버 시점: 호스트에게 송금 카드 */}
        {!isHost && host && hostShareAmount && (
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
            <p className="text-xs text-foreground/70">
              호스트(<span className="font-medium text-foreground">{host.nickname}</span>)에게 송금
            </p>
            <p className="mt-1 text-lg font-bold text-brand">
              {formatKrw(hostShareAmount)}
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-2 w-full"
              onClick={handleSendMoney}
            >
              카카오톡 송금 바로가기
            </Button>
          </div>
        )}

        {/* 호스트 평가 블록 (별점 + 한줄평) */}
        {showHostBlock && host && (
          <section className="rounded-lg border border-foreground/10 p-3">
            <div className="flex items-center gap-2">
              <Avatar nickname={host.nickname} size={32} />
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{host.nickname}</span>
                  <span className="text-foreground/60"> (호스트)</span>
                </p>
                <p className="text-[11px] text-foreground/50">별점과 한 줄 평을 남겨주세요</p>
              </div>
            </div>

            <div className="mt-3 flex gap-1" role="radiogroup" aria-label="호스트 별점">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={hostStars === n}
                  onClick={() => setHostStars(n)}
                  className={cn(
                    "h-9 w-9 rounded-md text-xl transition-colors",
                    n <= hostStars
                      ? "text-amber-400"
                      : "text-foreground/20 hover:text-foreground/40",
                  )}
                >
                  ★
                </button>
              ))}
            </div>

            <Textarea
              placeholder="친절했어요 / 시간 잘 지키셨어요 …"
              value={hostComment}
              onChange={(e) => setHostComment(e.target.value)}
              maxLength={500}
              className="mt-2"
            />
          </section>
        )}

        {/* 멤버 평가 블록 (좋았어요 / 별로) */}
        {showMemberBlock && memberTargets.length > 0 && (
          <section className="flex flex-col gap-2">
            {memberTargets.map((p) => {
              const current = memberRatings[p.id];
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-foreground/10 p-3"
                >
                  <div className="flex items-center gap-2">
                    <Avatar nickname={p.nickname} size={32} />
                    <p className="text-sm">
                      <span className="font-semibold">{p.nickname}</span>
                      {p.is_host && (
                        <span className="ml-1 text-[11px] text-brand">호스트</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {(["good", "bad"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() =>
                          setMemberRatings((prev) => ({ ...prev, [p.id]: r }))
                        }
                        className={cn(
                          "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                          current === r
                            ? r === "good"
                              ? "bg-emerald-600 text-white"
                              : "bg-foreground/60 text-white"
                            : "bg-foreground/5 text-foreground/70 hover:bg-foreground/10",
                        )}
                      >
                        {r === "good" ? "좋았어요" : "별로"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-900">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={handleSubmit}
            disabled={!allRated || submitting}
            className="flex-1"
          >
            {submitting ? "등록 중..." : isHost ? "완료 처리 + 평가 등록" : "평가 등록"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
