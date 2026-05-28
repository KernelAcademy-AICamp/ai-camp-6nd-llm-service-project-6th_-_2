// 내 채팅 목록 — 참여 중인(approved) 파티 중 채팅방이 열린 것만.
// 모집 마감(closed)·진행(in_progress)·완료(completed) 상태 포함. cancelled 제외.

import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth";
import { listParties } from "@/lib/queries";
import { displayStatusLabel, displayStatusColor, formatKstShort } from "@/lib/party-status";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ChatListPage() {
  const me = await requireCurrentUser();

  const parties = await listParties({
    participantId: me.id,
    statuses: ["closed", "in_progress", "completed"],
    sort: "latest",
  });

  if (parties.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="mb-3 text-4xl" aria-hidden>
          💬
        </span>
        <h1 className="text-lg font-bold text-zinc-900">아직 참여 중인 반띵이 없어요</h1>
        <p className="mt-2 text-sm text-zinc-500">
          홈에서 마음에 드는 반띵에 참여하거나
          <br />
          직접 등록해보세요.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-2 p-4">
      <h1 className="px-1 pb-1 text-base font-bold text-zinc-900">채팅</h1>
      <ul className="flex flex-col gap-2">
        {parties.map((p) => (
          <li key={p.id}>
            <Link
              href={`/chat/${p.id}` as any}
              className="flex items-center gap-3 rounded-2xl border border-black/[0.04] bg-white px-4 py-3 transition-colors active:bg-zinc-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-bold text-zinc-900">
                    {p.store_name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      displayStatusColor[p.display_status],
                    )}
                  >
                    {displayStatusLabel[p.display_status]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                  {p.occupied_count}/{p.max_participants}명 · {formatKstShort(p.deal_at)}
                </p>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                className="shrink-0 text-zinc-400"
              >
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
