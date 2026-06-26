"use client";

// 채팅방에서 회원을 탭하면 뜨는 공개 프로필 바텀시트.
// 등급·거래·후기 등 신뢰 정보만 보여준다(운영자 콘솔과 별개).

import { useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { levelLabel } from "@/lib/party-status";
import { askConfirm } from "@/lib/confirm";
import { getMemberPublicProfile, type MemberPublicProfile } from "@/app/_actions/member-profile";
import {
  submitChatReport,
  toggleBlockUser,
  type ChatReportReason,
} from "@/app/_actions/chat-moderation";

const LEVEL_EMOJI: Record<string, string> = { dandelion: "🌼", tree: "🌳", king: "👑" };

// 채팅 신고 사유 — 분쟁 유형과 동일한 코드. (운영자 /admin/reports 와 라벨 일치)
const REPORT_REASONS: { code: ChatReportReason; label: string }[] = [
  { code: "no_show", label: "노쇼 (안 나타남/연락두절)" },
  { code: "late", label: "지각/지연" },
  { code: "payment", label: "정산 분쟁 (미정산 등)" },
  { code: "unfair", label: "금액/수량 불만" },
  { code: "abusive", label: "무례한 언행/시비" },
  { code: "scam", label: "사기 의심" },
  { code: "other", label: "기타" },
];

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400_000));
}
function reviewAgo(iso: string): string {
  const d = daysSince(iso);
  if (d <= 0) return "오늘";
  if (d < 7) return `${d}일 전`;
  if (d < 30) return `${Math.floor(d / 7)}주 전`;
  return `${Math.floor(d / 30)}개월 전`;
}

export function MemberProfileSheet({
  userId,
  currentUserId,
  partyName,
  partyId,
  isHost = false,
  onClose,
  onBlockChange,
}: {
  userId: string | null;
  currentUserId?: string;
  partyName?: string | null;
  partyId?: string; // 신고 시 거래 맥락(운영자 채팅 로그 점프)
  isHost?: boolean;
  onClose: () => void;
  // 차단 상태가 바뀌면 부모(채팅 컨테이너)가 타임라인을 갱신하도록 알림
  onBlockChange?: (targetUserId: string, blocked: boolean) => void;
}) {
  const [data, setData] = useState<MemberPublicProfile | null>(null);
  const [loading, setLoading] = useState(false);

  // 신고/차단 UI 상태
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ChatReportReason>("no_show");
  const [detail, setDetail] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!userId) {
      setData(null);
      return;
    }
    // 시트가 새 회원으로 열릴 때마다 신고/차단 패널 초기화
    setReportOpen(false);
    setReason("no_show");
    setDetail("");
    setFeedback(null);
    let alive = true;
    setLoading(true);
    getMemberPublicProfile(userId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setBlocked(!!d?.is_blocked);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId]);

  const isSelf = !!currentUserId && !!data && data.id === currentUserId;

  function handleSubmitReport() {
    if (!data) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await submitChatReport({
        targetUserId: data.id,
        reasonCode: reason,
        detail,
        partyName: partyName ?? undefined,
        partyId,
      });
      if (res.ok) {
        setReportOpen(false);
        setDetail("");
        setFeedback("신고가 접수됐어요. 운영자가 확인할게요.");
      } else {
        setFeedback(res.error);
      }
    });
  }

  function handleToggleBlock() {
    if (!data) return;
    const next = !blocked;
    startTransition(async () => {
      if (next) {
        const ok = await askConfirm({
          title: `${data.nickname}님을 차단할까요?`,
          description: "차단하면 이 채팅방에서 상대의 메시지가 보이지 않아요. 언제든 해제할 수 있어요.",
          confirmText: "차단",
          destructive: true,
        });
        if (!ok) return;
      }
      const res = await toggleBlockUser(data.id, next);
      if (res.ok) {
        setBlocked(next);
        setFeedback(next ? "차단했어요." : "차단을 해제했어요.");
        onBlockChange?.(data.id, next);
      } else {
        setFeedback(res.error);
      }
    });
  }

  return (
    <Sheet open={!!userId} onClose={onClose} title="회원 정보" maxHeightPct={80}>
      {loading || !data ? (
        <div className="px-4 py-12 text-center text-sm text-gray-400">
          {loading ? "불러오는 중…" : "회원 정보를 찾지 못했어요."}
        </div>
      ) : (
        <div className="px-4 py-4">
          {/* 헤더 */}
          <div className="flex items-center gap-3.5">
            <Avatar nickname={data.nickname} size={56} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[18px] font-bold text-gray-900">{data.nickname}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">
                  {LEVEL_EMOJI[data.level] ?? "•"} {levelLabel[data.level] ?? data.level} 등급
                </span>
                {isHost && (
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11.5px] font-semibold text-brand">
                    방장
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12.5px] text-gray-500">
                {[data.neighborhood_name ?? "동네 미설정", `가입 ${daysSince(data.joined_at)}일`].join(" · ")}
              </p>
            </div>
          </div>

          {/* 신뢰 통계 */}
          <div className="mt-4 flex overflow-hidden rounded-2xl ring-1 ring-black/[0.06]">
            <Stat label="완료 거래" value={data.transaction_count} />
            <Stat label="좋았어요" value={data.good_review_count} valueClass="text-emerald-600" border />
            <Stat label="아쉬워요" value={data.bad_review_count} border />
          </div>
          {data.no_show_count > 0 && (
            <p className="mt-2 text-[11.5px] font-medium text-rose-500">노쇼 {data.no_show_count}회 기록</p>
          )}

          {/* 받은 후기 */}
          <p className="mb-2 mt-5 text-[13px] font-bold text-gray-900">받은 후기</p>
          {data.reviews.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-[12.5px] text-gray-400">
              아직 받은 후기가 없어요.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.reviews.map((r, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-[14px]" aria-hidden>
                    {r.rating === "good" ? "👍" : "👎"}
                  </span>
                  <span className="flex-1 text-[13px] text-gray-700">
                    {r.text ?? (r.rating === "good" ? "좋았어요" : "아쉬웠어요")}
                    {r.is_no_show && <span className="ml-1 text-[11px] font-semibold text-rose-500">· 노쇼</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-400">{reviewAgo(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 신고/차단 — 본인 프로필에는 노출하지 않음 */}
          {!isSelf && (
            <div className="mt-6 border-t border-black/[0.06] pt-4">
              {feedback && (
                <p className="mb-3 rounded-xl bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">{feedback}</p>
              )}

              {!reportOpen ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setFeedback(null);
                      setReportOpen(true);
                    }}
                    disabled={pending}
                    className="flex-1 rounded-xl bg-rose-50 py-2.5 text-[13.5px] font-semibold text-rose-600 active:bg-rose-100 disabled:opacity-50"
                  >
                    🚨 신고하기
                  </button>
                  <button
                    onClick={handleToggleBlock}
                    disabled={pending}
                    className={
                      blocked
                        ? "flex-1 rounded-xl bg-gray-900 py-2.5 text-[13.5px] font-semibold text-white active:opacity-80 disabled:opacity-50"
                        : "flex-1 rounded-xl bg-gray-100 py-2.5 text-[13.5px] font-semibold text-gray-700 active:bg-gray-200 disabled:opacity-50"
                    }
                  >
                    {blocked ? "차단 해제" : "차단하기"}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[13px] font-bold text-gray-900">신고 사유</p>
                  <div className="flex flex-col gap-1.5">
                    {REPORT_REASONS.map((r) => (
                      <label
                        key={r.code}
                        className={
                          reason === r.code
                            ? "flex items-center gap-2.5 rounded-xl bg-rose-50 px-3 py-2.5 text-[13px] font-semibold text-rose-700 ring-1 ring-rose-200"
                            : "flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5 text-[13px] text-gray-700 active:bg-gray-100"
                        }
                      >
                        <input
                          type="radio"
                          name="report-reason"
                          checked={reason === r.code}
                          onChange={() => setReason(r.code)}
                          className="accent-rose-500"
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    placeholder="상황을 적어주세요 (선택) — 예: 거래 시간 40분 지났는데 답이 없어요"
                    rows={3}
                    className="mt-3 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-800 outline-none focus:border-gray-400"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setReportOpen(false)}
                      disabled={pending}
                      className="flex-1 rounded-xl bg-gray-100 py-2.5 text-[13.5px] font-semibold text-gray-600 active:bg-gray-200 disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSubmitReport}
                      disabled={pending}
                      className="flex-[1.4] rounded-xl bg-rose-600 py-2.5 text-[13.5px] font-bold text-white active:opacity-80 disabled:opacity-50"
                    >
                      {pending ? "접수 중…" : "신고 접수"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Stat({
  label,
  value,
  valueClass,
  border,
}: {
  label: string;
  value: number;
  valueClass?: string;
  border?: boolean;
}) {
  return (
    <div className={`flex-1 py-3 text-center ${border ? "border-l border-black/[0.06]" : ""}`}>
      <p className={`text-[18px] font-bold text-gray-900 ${valueClass ?? ""}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-gray-500">{label}</p>
    </div>
  );
}
