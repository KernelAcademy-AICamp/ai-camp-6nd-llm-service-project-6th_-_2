"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCommunityComment,
  deleteCommunityComment,
  deleteCommunityPost,
  toggleCommentLike,
  togglePostLike,
} from "@/app/_actions/community";
import { createClient } from "@/lib/supabase/client";
import {
  communityCategoryMeta,
  type CommunityCommentRow,
  type CommunityPostRow,
} from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { CommunityAvatar, levelEmoji } from "./CommunityAvatar";

type ReplyTarget = { id: string; nickname: string } | null;

export function CommunityPostClient({
  post,
  comments,
  meId,
  neighborhoodName,
}: {
  post: CommunityPostRow;
  comments: CommunityCommentRow[];
  meId: string;
  neighborhoodName: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const cat = communityCategoryMeta(post.category);
  const isAuthor = post.author.id === meId;

  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  useEffect(() => {
    setLiked(post.liked_by_me);
    setLikeCount(post.like_count);
  }, [post.liked_by_me, post.like_count]);

  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget>(null);
  const [sending, setSending] = useState(false);

  // 댓글을 최상위 + 답글로 그룹핑
  const { roots, repliesOf } = useMemo(() => {
    const roots: CommunityCommentRow[] = [];
    const repliesOf = new Map<string, CommunityCommentRow[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const arr = repliesOf.get(c.parent_id) ?? [];
        arr.push(c);
        repliesOf.set(c.parent_id, arr);
      } else {
        roots.push(c);
      }
    }
    return { roots, repliesOf };
  }, [comments]);

  useEffect(() => {
    const channel = supabase
      .channel(`community-post-${post.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_comments",
          filter: `post_id=eq.${post.id}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router, post.id]);

  async function onToggleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    const res = await togglePostLike(post.id);
    if (!res.ok) {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  }

  async function onDeletePost() {
    if (!confirm("이 글을 삭제할까요?")) return;
    const res = await deleteCommunityPost(post.id);
    if (!res.ok) return alert(res.error);
    router.replace("/community");
  }

  function startReply(target: ReplyTarget) {
    setReplyTo(target);
    inputRef.current?.focus();
  }

  async function onSubmitComment() {
    const body = comment.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await createCommunityComment({
      postId: post.id,
      body,
      parentId: replyTo?.id ?? null,
    });
    setSending(false);
    if (!res.ok) return alert(res.error);
    setComment("");
    setReplyTo(null);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-zinc-100 px-2 py-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {isAuthor && (
          <button
            type="button"
            onClick={onDeletePost}
            className="rounded-full px-4 py-2.5 text-[14px] font-medium text-zinc-500 active:text-rose-500"
          >
            삭제
          </button>
        )}
      </header>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto">
        {/* 작성자 카드 */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-3.5">
            <CommunityAvatar name={post.author.nickname} size={46} />
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[15px] font-bold text-zinc-900">
                  {post.author.nickname}
                </span>
                <span aria-hidden>{levelEmoji(post.author.level)}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-400">
                {neighborhoodName && (
                  <span className="rounded-md bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-dark">
                    📍 {neighborhoodName}
                  </span>
                )}
                <span>{timeAgo(post.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 제목/본문 */}
        <article className="px-5 pt-4">
          <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[12px] font-medium text-zinc-500">
            {cat.emoji} {cat.label}
          </span>
          <h2 className="mt-2.5 text-[22px] font-extrabold leading-snug text-zinc-900">
            {post.title}
          </h2>
          <p className="mt-3.5 whitespace-pre-wrap text-[16px] leading-[1.7] text-zinc-800">
            {post.body}
          </p>

          {post.image_urls.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {post.image_urls.map((url, i) => (
                <div
                  key={url}
                  className="relative w-full overflow-hidden rounded-2xl bg-zinc-100"
                  style={{ aspectRatio: "4 / 3" }}
                >
                  <Image
                    src={url}
                    alt={`첨부 이미지 ${i + 1}`}
                    fill
                    sizes="(max-width: 448px) 100vw, 448px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </article>

        {/* 좋아요 / 댓글 분할 바 */}
        <div className="mt-5 flex items-stretch border-y border-zinc-100">
          <button
            type="button"
            onClick={onToggleLike}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 py-4 text-[15px] font-bold transition active:bg-zinc-50",
              liked ? "text-rose-500" : "text-zinc-600",
            )}
          >
            <Heart filled={liked} size={20} /> 공감 {likeCount}
          </button>
          <span className="my-3 w-px bg-zinc-100" />
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className="flex flex-1 items-center justify-center gap-2 py-4 text-[15px] font-bold text-zinc-600 transition active:bg-zinc-50"
          >
            <CommentIcon /> 댓글 {post.comment_count}
          </button>
        </div>

        {/* 댓글 목록 */}
        <section className="px-5 py-4">
          <h3 className="mb-1 text-[15px] font-bold text-zinc-800">
            댓글 <span className="text-brand">{post.comment_count}</span>
          </h3>
          {roots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <span className="text-4xl" aria-hidden>💬</span>
              <p className="text-[14px] text-zinc-400">첫 댓글을 남겨보세요!</p>
              <button
                type="button"
                onClick={() => startReply(null)}
                className="mt-1 rounded-full bg-zinc-100 px-5 py-2.5 text-[14px] font-semibold text-zinc-600 active:bg-zinc-200"
              >
                댓글 쓰기
              </button>
            </div>
          ) : (
            <ul className="flex flex-col">
              {roots.map((c) => (
                <li key={c.id} className="border-b border-zinc-50 py-4 last:border-0">
                  <CommentItem
                    comment={c}
                    isMine={c.author.id === meId}
                    onReply={() =>
                      startReply({ id: c.id, nickname: c.author.nickname })
                    }
                    onChanged={() => router.refresh()}
                  />
                  {/* 답글 */}
                  {(repliesOf.get(c.id) ?? []).length > 0 && (
                    <ul className="mt-3 flex flex-col gap-3 border-l-2 border-zinc-100 pl-3">
                      {(repliesOf.get(c.id) ?? []).map((r) => (
                        <li key={r.id}>
                          <CommentItem
                            comment={r}
                            isMine={r.author.id === meId}
                            isReply
                            onReply={() =>
                              startReply({
                                id: c.id,
                                nickname: r.author.nickname,
                              })
                            }
                            onChanged={() => router.refresh()}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 댓글 입력 (BottomNav 위에 정렬) */}
      <div className="border-t border-zinc-100 bg-white">
        {replyTo && (
          <div className="flex items-center justify-between bg-zinc-50 px-4 py-2 text-[12px] text-zinc-500">
            <span>
              <b className="font-semibold text-zinc-700">{replyTo.nickname}</b>
              님에게 답글 다는 중
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="rounded px-2 py-1 font-medium text-zinc-400 active:text-zinc-700"
            >
              취소
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <textarea
            ref={inputRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={1}
            maxLength={1000}
            placeholder={
              replyTo ? `${replyTo.nickname}님에게 답글…` : "따뜻한 댓글을 남겨주세요"
            }
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl bg-zinc-100 px-4 py-3 text-[15px] text-zinc-800 outline-none placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={onSubmitComment}
            disabled={!comment.trim() || sending}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition",
              comment.trim() && !sending
                ? "bg-brand text-white active:scale-95"
                : "bg-zinc-100 text-zinc-300",
            )}
            aria-label="댓글 등록"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12l16-8-6 16-3-7-7-1Z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  isMine,
  isReply = false,
  onReply,
  onChanged,
}: {
  comment: CommunityCommentRow;
  isMine: boolean;
  isReply?: boolean;
  onReply: () => void;
  onChanged: () => void;
}) {
  const [liked, setLiked] = useState(comment.liked_by_me);
  const [count, setCount] = useState(comment.like_count);
  useEffect(() => {
    setLiked(comment.liked_by_me);
    setCount(comment.like_count);
  }, [comment.liked_by_me, comment.like_count]);

  async function onLike() {
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    const res = await toggleCommentLike(comment.id);
    if (!res.ok) {
      setLiked(!next);
      setCount((c) => c + (next ? -1 : 1));
    }
  }

  async function onDelete() {
    if (!confirm("댓글을 삭제할까요?")) return;
    const res = await deleteCommunityComment(comment.id);
    if (!res.ok) return alert(res.error);
    onChanged();
  }

  return (
    <div className="flex gap-2.5">
      <CommunityAvatar name={comment.author.nickname} size={isReply ? 30 : 36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[12px]">
          <span className="font-bold text-zinc-800">{comment.author.nickname}</span>
          <span aria-hidden>{levelEmoji(comment.author.level)}</span>
          <span className="text-zinc-400">· {timeAgo(comment.created_at)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">
          {comment.body}
        </p>
        <div className="mt-1.5 flex items-center gap-3 text-[12px] font-medium text-zinc-400">
          <button type="button" onClick={onReply} className="active:text-zinc-700">
            답글 달기
          </button>
          {isMine && (
            <button type="button" onClick={onDelete} className="active:text-rose-500">
              삭제
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onLike}
        className={cn(
          "flex shrink-0 flex-col items-center gap-0.5 px-1.5 pt-0.5 text-[11px]",
          liked ? "text-rose-500" : "text-zinc-400",
        )}
        aria-label="공감"
      >
        <Heart filled={liked} size={16} />
        {count > 0 && <span>{count}</span>}
      </button>
    </div>
  );
}

function Heart({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden>
      <path
        d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.8 6.2A1.8 1.8 0 0 1 6.6 4.5h10.8a1.8 1.8 0 0 1 1.8 1.7V14a1.8 1.8 0 0 1-1.8 1.8h-6.2L7 18.8a.5.5 0 0 1-.8-.4v-2.6A1.8 1.8 0 0 1 4.8 14V6.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
