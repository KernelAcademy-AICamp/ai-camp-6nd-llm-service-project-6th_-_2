// 운영자 — 모든 동네의 커뮤니티 글 목록(읽기 전용).
// 일반 유저는 같은 동네만 보지만 admin은 동네 구분 없이 전부 본다.

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listAllCommunityPosts } from "@/lib/admin-queries";
import { communityCategoryMeta } from "@/lib/types";
import { formatKstShort } from "@/lib/party-status";

export const dynamic = "force-dynamic";

export default async function AdminCommunityPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const posts = await listAllCommunityPosts();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-3 bg-zinc-50 p-4">
      <header className="flex items-center justify-between px-1">
        <h1 className="text-lg font-bold text-zinc-900">🛠 운영자</h1>
        <span className="text-xs text-zinc-500">커뮤니티 {posts.length}건</span>
      </header>

      <nav className="flex gap-1.5 px-1 text-[13px] font-semibold">
        <Link
          href={"/admin" as any}
          className="rounded-full bg-white px-3 py-1 text-zinc-500 transition-colors active:bg-zinc-100"
        >
          모집글
        </Link>
        <span className="rounded-full bg-zinc-900 px-3 py-1 text-white">커뮤니티</span>
      </nav>

      {posts.length === 0 ? (
        <p className="px-1 py-12 text-center text-sm text-zinc-500">커뮤니티 글이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((p) => {
            const cat = communityCategoryMeta(p.category);
            return (
              <li key={p.id}>
                <Link
                  href={`/admin/community/${p.id}` as any}
                  className="flex items-center gap-3 rounded-2xl border border-black/[0.04] bg-white px-4 py-3 transition-colors active:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 text-[11px]">
                        {cat.emoji} {cat.label}
                      </span>
                      <span className="truncate text-[14px] font-bold text-zinc-900">
                        {p.title}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                      {p.author_nickname ?? "?"} · {p.neighborhood_name ?? "동네?"} · ♡{" "}
                      {p.like_count} · 💬 {p.comment_count} · {formatKstShort(p.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-zinc-400">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
