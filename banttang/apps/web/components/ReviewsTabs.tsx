"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatKstFriendly } from "@/lib/party-status";
import { cn } from "@/lib/utils";
import { splitReviewText } from "@/lib/review-tags";
import { deleteReview } from "@/app/_actions/delete-review";

interface WrittenItem {
  id: string;
  party_id: string;
  rating: "good" | "bad";
  text_review: string | null;
  created_at: string;
  party: { store_name: string; deal_at: string } | null;
  reviewee_nickname: string;
}

interface ReceivedItem {
  id: string;
  party_id: string;
  rating: "good" | "bad";
  text_review: string | null;
  created_at: string;
  party: { store_name: string; deal_at: string } | null;
  reviewer_nickname: string;
}

type Tab = "written" | "received";

export function ReviewsTabs({
  written,
  received,
}: {
  written: WrittenItem[];
  received: ReceivedItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("written");

  return (
    <div>
      {/* 자체 헤더 — ← 옆에 "띵동 후기" 인라인 */}
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
        <h1 className="text-[16px] font-bold text-zinc-900">띵동 후기</h1>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {/* Pill 탭 */}
        <div className="flex rounded-2xl bg-zinc-100 p-1">
          <TabButton active={tab === "written"} onClick={() => setTab("written")}>
            작성 후기
          </TabButton>
          <TabButton active={tab === "received"} onClick={() => setTab("received")}>
            받은 후기
          </TabButton>
        </div>

        {tab === "written" ? <WrittenTab items={written} /> : <ReceivedTab items={received} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-xl py-2.5 text-[14px] font-bold transition-colors",
        active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400",
      )}
    >
      {children}
    </button>
  );
}

type CardData = {
  reviewId: string;
  partyId: string;
  title: string; // 상대 닉네임 (작성: reviewee / 받은: reviewer)
  rating: "good" | "bad";
  party: { store_name: string; deal_at: string } | null;
  text_review: string | null;
};

// ─── 작성 후기 탭 ───
function WrittenTab({ items }: { items: WrittenItem[] }) {
  if (items.length === 0) {
    return <EmptyState lines={["아직 작성한 후기가 없어요."]} />;
  }
  return (
    <ReviewList
      cards={items.map((it) => ({
        reviewId: it.id,
        partyId: it.party_id,
        title: it.reviewee_nickname,
        rating: it.rating,
        party: it.party,
        text_review: it.text_review,
      }))}
      emptyLine="작성한 후기를 모두 삭제했어요."
    />
  );
}

// ─── 받은 후기 탭 ───
function ReceivedTab({ items }: { items: ReceivedItem[] }) {
  if (items.length === 0) {
    return <EmptyState lines={["아직 받은 후기가 없어요."]} />;
  }
  return (
    <ReviewList
      cards={items.map((r) => ({
        reviewId: r.id,
        partyId: r.party_id,
        title: r.reviewer_nickname,
        rating: r.rating,
        party: r.party,
        text_review: r.text_review,
      }))}
      emptyLine="받은 후기를 모두 삭제했어요."
    />
  );
}

// 작성/받은 공통 리스트 — 삭제하면 즉시 화면에서 제거.
function ReviewList({ cards, emptyLine }: { cards: CardData[]; emptyLine: string }) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const visible = cards.filter((c) => !removed.has(c.reviewId));
  if (visible.length === 0) return <EmptyState lines={[emptyLine]} />;
  return (
    <ul className="flex flex-col gap-2">
      {visible.map((c) => (
        <li key={c.reviewId}>
          <ReviewCard
            data={c}
            onDeleted={(id) =>
              setRemoved((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}

// 카드 — 클릭 시 모집글로 이동, 우상단 미트볼 메뉴(삭제하기).
function ReviewCard({
  data,
  onDeleted,
}: {
  data: CardData;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    if (!confirm("이 후기를 삭제할까요?")) return;
    setBusy(true);
    const res = await deleteReview(data.reviewId);
    setBusy(false);
    setMenuOpen(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    onDeleted(data.reviewId);
  }

  return (
    <div
      onClick={() => router.push(`/feed/${data.partyId}?from=review` as any)}
      className="relative cursor-pointer rounded-2xl border border-black/[0.04] bg-white p-4 active:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[14px] font-bold text-zinc-900">
          {data.title}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="더보기"
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 active:bg-zinc-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="5" r="1.6" fill="currentColor" />
                <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                <circle cx="12" cy="19" r="1.6" fill="currentColor" />
              </svg>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 min-w-[120px] overflow-hidden rounded-xl border border-black/5 bg-white py-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDelete}
                  disabled={busy}
                  className="w-full px-4 py-2.5 text-left text-[14px] font-medium text-rose-600 active:bg-rose-50 disabled:opacity-40"
                >
                  삭제하기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {data.party && (
        <p className="mt-1 truncate text-[12px] text-zinc-500">
          {data.party.store_name} · {formatKstFriendly(data.party.deal_at)}
        </p>
      )}
      {data.text_review &&
        (() => {
          // 선택 태그(체크) ↔ 자유 텍스트 분리. 선택 태그는 좋아요=그린/싫어요=로즈로 강조.
          const { tags, freeText } = splitReviewText(data.text_review);
          return (
            <>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[12px] font-semibold",
                        data.rating === "good"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-rose-50 text-rose-600",
                      )}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {freeText && (
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-[13px] text-zinc-700">
                  {freeText}
                </p>
              )}
            </>
          );
        })()}
    </div>
  );
}

function EmptyState({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-4 h-14 w-12 rounded-md bg-zinc-100" aria-hidden />
      {lines.map((t, i) => (
        <p key={i} className="text-[13px] text-zinc-400">
          {t}
        </p>
      ))}
    </div>
  );
}
