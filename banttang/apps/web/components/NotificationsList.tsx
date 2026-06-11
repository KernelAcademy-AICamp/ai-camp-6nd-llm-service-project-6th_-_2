"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: string | null;
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
}

const KST_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// ─── 타입별 아이콘/색상 매핑 ───
const ICON_MAP: Record<string, { emoji: string; bg: string }> = {
  review_requested: { emoji: "💝", bg: "bg-rose-100" },
  party_full: { emoji: "🎉", bg: "bg-amber-100" },
  party_closed: { emoji: "🎊", bg: "bg-amber-100" },
  party_completed: { emoji: "✅", bg: "bg-emerald-100" },
  party_cancelled: { emoji: "🗑️", bg: "bg-zinc-100" },
  approved: { emoji: "✅", bg: "bg-emerald-100" },
  rejected: { emoji: "❌", bg: "bg-rose-100" },
  chat_message: { emoji: "💬", bg: "bg-sky-100" },
  midpoint_recommended: { emoji: "📍", bg: "bg-violet-100" },
  receipt_uploaded: { emoji: "🧾", bg: "bg-amber-100" },
};

function getIcon(type: string | null) {
  if (type && ICON_MAP[type]) return ICON_MAP[type];
  return { emoji: "🔔", bg: "bg-zinc-100" };
}

// KST 기준 같은 날인지
function sameKstDay(a: Date, b: Date): boolean {
  const ak = new Date(a.getTime() + 9 * 60 * 60 * 1000);
  const bk = new Date(b.getTime() + 9 * 60 * 60 * 1000);
  return (
    ak.getUTCFullYear() === bk.getUTCFullYear() &&
    ak.getUTCMonth() === bk.getUTCMonth() &&
    ak.getUTCDate() === bk.getUTCDate()
  );
}

// "오늘 · 6월 9일 · 월" / "어제 · 6월 8일 · 일" / "6월 7일 · 토"
function formatDateHeader(d: Date, today: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const w = KST_WEEKDAYS[kst.getUTCDay()];
  const base = `${m}월 ${day}일 · ${w}`;
  if (sameKstDay(d, today)) return `오늘 · ${base}`;
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  if (sameKstDay(d, yesterday)) return `어제 · ${base}`;
  return base;
}

// "오후 6:25" / "오전 11:42"
function formatTime(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const h24 = kst.getUTCHours();
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  const ap = h24 < 12 ? "오전" : "오후";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${ap} ${h12}:${mi}`;
}

// 날짜별로 묶기 (KST 기준)
function groupByDay(items: NotificationItem[]) {
  const groups: Array<{ key: string; date: Date; items: NotificationItem[] }> = [];
  let last: { key: string; date: Date; items: NotificationItem[] } | null = null;
  for (const n of items) {
    const d = new Date(n.created_at);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const key = `${kst.getUTCFullYear()}-${kst.getUTCMonth()}-${kst.getUTCDate()}`;
    if (!last || last.key !== key) {
      last = { key, date: d, items: [n] };
      groups.push(last);
    } else {
      last.items.push(n);
    }
  }
  return groups;
}

export function NotificationsList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const today = new Date();
  const groups = groupByDay(items);

  return (
    <div className="flex flex-col">
      {/* 자체 헤더 — ← 알림 */}
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
        <h1 className="text-[16px] font-bold text-zinc-900">알림</h1>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <span className="mb-3 text-4xl" aria-hidden>
            🔔
          </span>
          <p className="text-[13px] text-zinc-400">아직 받은 알림이 없어요.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="px-4 pb-1 pt-5 text-[12px] font-medium text-zinc-400">
                {formatDateHeader(g.date, today)}
              </h2>
              <ul>
                {g.items.map((n) => (
                  <NotifItem key={n.id} item={n} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NotifItem({ item }: { item: NotificationItem }) {
  const icon = getIcon(item.type);
  const inner = (
    <div className="flex items-start gap-3 px-4 py-3.5 active:bg-zinc-50">
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            icon.bg,
          )}
        >
          <span className="text-[18px]" aria-hidden>
            {icon.emoji}
          </span>
        </div>
        {!item.is_read && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white"
            aria-label="안 읽음"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-zinc-900">{item.title}</p>
        {item.body && (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-500">
            {item.body}
          </p>
        )}
        <p className="mt-1 text-[11px] text-zinc-400">{formatTime(item.created_at)}</p>
      </div>
      {item.link_path && (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="mt-1 shrink-0 text-zinc-300"
        >
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
  if (item.link_path) {
    return (
      <li>
        <Link href={item.link_path as any} className="block">
          {inner}
        </Link>
      </li>
    );
  }
  return <li>{inner}</li>;
}
