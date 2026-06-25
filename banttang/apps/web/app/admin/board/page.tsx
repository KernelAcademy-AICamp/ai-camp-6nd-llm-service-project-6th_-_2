// 운영자 — 게시판 관리(모집글 목록). 모든 모집글을 상태 무관하게 한눈에.
// is_admin이 아닌 사용자는 홈으로 돌려보낸다. (운영자 첫 진입은 /admin → 대시보드)

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listAllParties } from "@/lib/admin-queries";
import {
  displayStatusLabel,
  displayStatusColor,
  categoryLabel,
  formatKstShort,
} from "@/lib/party-status";
import { cn } from "@/lib/utils";
import { BoardTabs } from "../_components/board-tabs";

export const dynamic = "force-dynamic";

export default async function AdminBoardPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const parties = await listAllParties();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-3 bg-brand-50/40 p-4">
      <header className="flex items-end justify-between px-1 py-1">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">게시판 관리</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">모집글 · 커뮤니티 모니터링</p>
        </div>
        <span className="text-xs text-zinc-500">모집글 {parties.length}건</span>
      </header>

      <BoardTabs active="parties" />
      {parties.length === 0 ? (
        <p className="px-1 py-12 text-center text-sm text-zinc-500">모집글이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {parties.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/parties/${p.id}` as any}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200/70 bg-white px-4 py-3 shadow-sm shadow-black/[0.02] transition-colors hover:border-brand/40 hover:bg-brand-50/40"
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
                    {categoryLabel[p.category] ?? p.category} · 호스트 {p.host_nickname ?? "?"} ·{" "}
                    {p.occupied_count}/{p.max_participants}명 · 💬 {p.message_count} ·{" "}
                    {formatKstShort(p.deal_at)}
                  </p>
                </div>
                <span className="shrink-0 text-zinc-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
