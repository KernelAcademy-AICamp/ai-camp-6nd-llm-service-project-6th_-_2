"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  HOST_GOOD_TAGS,
  HOST_BAD_TAGS,
  MEMBER_GOOD_TAGS,
  MEMBER_BAD_TAGS,
} from "@/lib/review-tags";

type Rating = "good" | "bad";

interface Other {
  user_id: string;
  is_host: boolean;
  nickname: string;
  level?: string | null;
}

interface ExistingReview {
  reviewee_id: string;
  rating: Rating;
  text_review: string | null;
}

function pickTags(revieweeIsHost: boolean, rating: "good" | "bad"): string[] {
  if (revieweeIsHost) {
    return rating === "good" ? HOST_GOOD_TAGS : HOST_BAD_TAGS;
  }
  return rating === "good" ? MEMBER_GOOD_TAGS : MEMBER_BAD_TAGS;
}

export function ReviewDetailClient({
  party,
  others,
  existing,
}: {
  party: { id: string };
  others: Other[];
  existing: ExistingReview[];
}) {
  const router = useRouter();
  const existingMap = useMemo(
    () => new Map(existing.map((r) => [r.reviewee_id, r])),
    [existing],
  );
  const pending = others.filter((o) => !existingMap.has(o.user_id));

  // 모두 작성 완료 — 요약 노출
  if (pending.length === 0) {
    return <CompletedSummary partyId={party.id} others={others} existing={existing} />;
  }

  // 미작성 멤버 중 첫 번째에 대해서만 폼 렌더 (한 명씩)
  const member = pending[0];

  return (
    <SingleMemberForm
      partyId={party.id}
      member={member}
      remainingCount={pending.length}
      onSubmitted={() => router.refresh()}
    />
  );
}

// ────────────────────────────────────────────────────────────
// 멤버 1명 후기 작성 폼
// ────────────────────────────────────────────────────────────
function SingleMemberForm({
  partyId,
  member,
  remainingCount,
  onSubmitted,
}: {
  partyId: string;
  member: Other;
  remainingCount: number;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState<Rating | undefined>();
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const tagOptions = rating ? pickTags(member.is_host, rating) : [];
  const tagSectionLabel =
    rating === "good"
      ? "어떤 점이 좋았나요? (선택)"
      : rating === "bad"
      ? "어떤 점이 싫었나요? (선택)"
      : null;
  const canSubmit = !!rating;

  function toggleTag(t: string) {
    setTags((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  // rating 바뀌면 태그 셋 초기화 (good ↔ bad)
  function selectRating(r: Rating) {
    if (r !== rating) setTags(new Set());
    setRating(r);
  }

  async function submit() {
    if (!rating) return;
    setBusy(true);
    try {
      const fullText = [
        Array.from(tags).join(", "),
        text.trim(),
      ]
        .filter(Boolean)
        .join("\n\n");
      const res = await fetch(`/api/parties/${partyId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            reviewee_id: member.user_id,
            rating,
            text_review: fullText || undefined,
          },
        ]),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "후기 저장 실패");
        return;
      }
      // 마지막 미작성 멤버 후기 제출 → 이 시점에 거래 완료 처리.
      // 실패해도 후기는 이미 저장됐으니 무시(다음 페이지에서 status 보고 재시도 가능).
      if (remainingCount === 1) {
        await fetch(`/api/parties/${partyId}/complete`, { method: "POST" }).catch(
          () => {},
        );
      }
      // 폼 리셋 + 서버 새로고침 → pending에서 빠지면서 다음 멤버 또는 요약 자동 노출
      setRating(undefined);
      setTags(new Set());
      setText("");
      onSubmitted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-32">
      <PageHeader subtitle={remainingCount > 1 ? `${remainingCount}명 남음` : undefined} />

      {/* 멤버 카드 — placeholder 박스 / 등급 노출 X */}
      <section className="mx-4 rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-[15px] font-bold text-zinc-900">
          {member.nickname}
          {member.is_host && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              파티장
            </span>
          )}
        </p>
      </section>

      {/* 1. 좋아요 / 싫어요 */}
      <section className="mx-4">
        <SectionHeader n={1} label="좋아요 / 싫어요" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <RatingButton
            kind="good"
            active={rating === "good"}
            onClick={() => selectRating("good")}
          />
          <RatingButton
            kind="bad"
            active={rating === "bad"}
            onClick={() => selectRating("bad")}
          />
        </div>
      </section>

      {/* 2. 태그 */}
      {rating && tagSectionLabel && (
        <section className="mx-4">
          <SectionHeader n={2} label={tagSectionLabel} />
          <ul className="mt-3 flex flex-col gap-2">
            {tagOptions.map((t) => (
              <li key={t}>
                <CheckboxRow
                  label={t}
                  checked={tags.has(t)}
                  onToggle={() => toggleTag(t)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3. 직접 입력 */}
      {rating && (
        <section className="mx-4">
          <SectionHeader n={3} label="직접 입력 (선택)" />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="자유롭게 후기를 남겨보세요"
            maxLength={200}
            className="mt-3 h-24 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] focus:border-zinc-400 focus:outline-none"
          />
        </section>
      )}

      {/* fixed 제출 바 */}
      <div className="fixed bottom-14 left-1/2 z-20 w-full max-w-md -translate-x-1/2 bg-zinc-50 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || busy}
          className={cn(
            "h-12 w-full rounded-xl text-[15px] font-bold transition-opacity",
            canSubmit && !busy
              ? "bg-brand text-white active:opacity-80"
              : "bg-zinc-200 text-zinc-400",
          )}
        >
          {busy ? "저장 중…" : "후기 등록"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 모두 작성 완료 요약
// ────────────────────────────────────────────────────────────
function CompletedSummary({
  partyId,
  others,
  existing,
}: {
  partyId: string;
  others: Other[];
  existing: ExistingReview[];
}) {
  const router = useRouter();
  const map = new Map(existing.map((r) => [r.reviewee_id, r]));

  if (others.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-[14px] text-zinc-400">평가할 멤버가 없어요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-32">
      <PageHeader title="후기 작성 완료" />

      <ul className="mt-2 flex flex-col gap-2 px-4">
        {others.map((o) => {
          const r = map.get(o.user_id);
          if (!r) return null;
          return (
            <li
              key={o.user_id}
              className="rounded-2xl border border-black/[0.04] bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-semibold text-zinc-900">
                  {o.nickname}
                  {o.is_host && (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      파티장
                    </span>
                  )}
                </p>
                <span
                  className={
                    r.rating === "good"
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700"
                      : "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700"
                  }
                >
                  {r.rating === "good" ? "👍 좋아요" : "👎 싫어요"}
                </span>
              </div>
              {r.text_review && (
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-[13px] text-zinc-700">
                  {r.text_review}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="fixed bottom-14 left-1/2 z-20 w-full max-w-md -translate-x-1/2 bg-zinc-50 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <button
          type="button"
          onClick={() => router.push(`/chat/${partyId}` as any)}
          className="h-12 w-full rounded-xl bg-brand text-[15px] font-bold text-white active:opacity-80"
        >
          확인
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 공용 UI 조각
// ────────────────────────────────────────────────────────────

// 자체 상단 헤더 — ← 뒤로 + 좌측 정렬 타이틀 (UserBar 숨기고 페이지 자체 렌더)
function PageHeader({
  title = "후기 작성",
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2.5">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="뒤로"
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <h1 className="text-[16px] font-bold text-zinc-900">
        {title}
        {subtitle && (
          <span className="ml-2 text-[12px] font-medium text-zinc-400">
            ({subtitle})
          </span>
        )}
      </h1>
    </header>
  );
}

function SectionHeader({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-bold text-white">
        {n}
      </span>
      <h2 className="text-[14px] font-bold text-zinc-900">{label}</h2>
    </div>
  );
}

function RatingButton({
  kind,
  active,
  onClick,
}: {
  kind: Rating;
  active: boolean;
  onClick: () => void;
}) {
  const isGood = kind === "good";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-12 items-center justify-center gap-1.5 rounded-xl border text-[14px] font-bold transition-colors",
        active
          ? isGood
            ? "border-brand bg-brand text-white"
            : "border-rose-500 bg-rose-500 text-white"
          : "border-zinc-200 bg-white text-zinc-700",
      )}
    >
      <span aria-hidden>{isGood ? "👍" : "👎"}</span>
      <span>{isGood ? "좋아요" : "싫어요"}</span>
    </button>
  );
}

function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1.5 active:bg-zinc-50"
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
          checked ? "border-brand bg-brand" : "border-zinc-300 bg-white",
        )}
        aria-hidden
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l4 4 10-10"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="text-[14px] text-zinc-700">{label}</span>
    </button>
  );
}
