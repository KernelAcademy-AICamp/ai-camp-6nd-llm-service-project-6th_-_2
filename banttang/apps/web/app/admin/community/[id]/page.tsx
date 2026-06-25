// 운영자 — 커뮤니티 글 상세 + 댓글/답글 전문(읽기 전용).

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getCommunityPostDetailForAdmin } from "@/lib/admin-queries";
import { communityCategoryMeta } from "@/lib/types";
import { formatKstShort } from "@/lib/party-status";
import { AdminDeleteButton } from "@/app/admin/_components/delete-button";

export const dynamic = "force-dynamic";

export default async function AdminCommunityDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const detail = await getCommunityPostDetailForAdmin(params.id);
  if (!detail) notFound();
  const { post, comments } = detail;
  const cat = communityCategoryMeta(post.category);

  // 답글을 부모 아래로 묶기: 최상위 댓글 순서대로, 각 댓글의 답글을 바로 뒤에.
  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-brand-50/40 p-4">
      <div className="flex items-center justify-between">
        <Link href={"/admin/community" as any} className="text-xs text-zinc-500">
          ‹ 커뮤니티 전체
        </Link>
        <AdminDeleteButton
          kind="post"
          id={post.id}
          label="글 삭제"
          confirmText="이 글을 삭제할까요? 댓글·답글까지 모두 삭제되며 되돌릴 수 없어요."
          redirectTo="/admin/community"
        />
      </div>

      {/* 글 본문 */}
      <article className="rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm shadow-black/[0.02]">
        <div className="flex items-center gap-1.5 text-[12px] text-zinc-500">
          <span>
            {cat.emoji} {cat.label}
          </span>
          <span>·</span>
          <span>{post.neighborhood_name ?? "동네?"}</span>
        </div>
        <h1 className="mt-1 text-base font-bold text-zinc-900">{post.title}</h1>
        <p className="mt-1 text-[12px] text-zinc-400">
          {post.author_nickname ?? "?"} · {formatKstShort(post.created_at)} · ♡ {post.like_count} ·
          💬 {post.comment_count}
        </p>
        <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-700">
          {post.body}
        </p>
        {post.image_urls.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.image_urls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="h-28 w-28 rounded-lg object-cover"
              />
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-zinc-400">post_id: {post.id}</p>
      </article>

      {/* 댓글 */}
      <section className="rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm shadow-black/[0.02]">
        <h2 className="mb-3 text-sm font-bold text-zinc-900">댓글 ({comments.length})</h2>
        {comments.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-zinc-400">댓글이 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {topLevel.map((c) => (
              <li key={c.id} className="flex flex-col gap-2">
                <CommentLine c={c} />
                {repliesOf(c.id).map((r) => (
                  <div key={r.id} className="ml-5 border-l-2 border-zinc-100 pl-3">
                    <CommentLine c={r} />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function CommentLine({
  c,
}: {
  c: {
    id: string;
    author_nickname: string | null;
    body: string;
    like_count: number;
    created_at: string;
  };
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-zinc-800">
          {c.author_nickname ?? "알수없음"}
        </span>
        <span className="text-[10px] text-zinc-400">{formatKstShort(c.created_at)}</span>
        {c.like_count > 0 && <span className="text-[10px] text-zinc-400">♡ {c.like_count}</span>}
        <span className="ml-auto">
          <AdminDeleteButton kind="comment" id={c.id} label="삭제" size="sm" />
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[13px] text-zinc-700">{c.body}</p>
    </div>
  );
}
