"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatKstFriendly } from "@/lib/party-status";
import { partyPhotoUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { StoreThumb } from "./StoreThumb";

interface WrittenItem {
  id: string;
  store_name: string;
  representative_menu: string | null;
  deal_at: string;
  photo_paths: string[];
  reviewed: boolean;
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

// ─── 작성 후기 탭 ───
function WrittenTab({ items }: { items: WrittenItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        lines={["작성 가능한 후기가 없어요.", "거래 후에 후기를 작성할 수 있어요."]}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.id}>
          <WrittenCard item={it} />
        </li>
      ))}
    </ul>
  );
}

function WrittenCard({ item }: { item: WrittenItem }) {
  const thumbPath = item.photo_paths?.[0] ?? null;
  return (
    <Link
      href={`/mypage/reviews/${item.id}` as any}
      className="flex items-center gap-3 rounded-2xl border border-black/[0.04] bg-white p-3 active:bg-zinc-50"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-brand-50">
        {thumbPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={partyPhotoUrl(thumbPath)}
            alt={item.store_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <StoreThumb storeName={item.store_name} menu={item.representative_menu} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold text-zinc-900">
          {item.store_name}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-zinc-500">
          🗓️ {formatKstFriendly(item.deal_at)}
        </p>
        <p
          className={cn(
            "mt-1 text-[11px] font-medium",
            item.reviewed ? "text-zinc-400" : "text-zinc-600",
          )}
        >
          {item.reviewed ? "👍 후기 작성 완료" : "📝 후기 미작성"}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold",
          item.reviewed ? "bg-zinc-100 text-zinc-500" : "bg-brand text-white",
        )}
      >
        {item.reviewed ? "후기 보기" : "후기 작성"}
      </span>
    </Link>
  );
}

// ─── 받은 후기 탭 ───
function ReceivedTab({ items }: { items: ReceivedItem[] }) {
  if (items.length === 0) {
    return <EmptyState lines={["아직 받은 후기가 없어요."]} />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((r) => (
        <li
          key={r.id}
          className="rounded-2xl border border-black/[0.04] bg-white p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[14px] font-bold text-zinc-900">
              {r.reviewer_nickname}
            </p>
            <span
              className={
                r.rating === "good"
                  ? "shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700"
                  : "shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700"
              }
            >
              {r.rating === "good" ? "👍 좋아요" : "👎 싫어요"}
            </span>
          </div>
          {r.party && (
            <p className="mt-1 truncate text-[12px] text-zinc-500">
              {r.party.store_name} · {formatKstFriendly(r.party.deal_at)}
            </p>
          )}
          {r.text_review && (
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-[13px] text-zinc-700">
              {r.text_review}
            </p>
          )}
        </li>
      ))}
    </ul>
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
