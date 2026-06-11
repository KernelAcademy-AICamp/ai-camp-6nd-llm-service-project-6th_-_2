"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  COMMUNITY_CATEGORIES,
  communityCategoryMeta,
  type CommunityCategory,
  type CommunityPostRow,
} from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { CommunityAvatar, levelEmoji } from "./CommunityAvatar";

// 🔥 인기글 기준 (좋아요 수)
const HOT_THRESHOLD = 5;

export function CommunityClient({
  posts,
  neighborhoodName,
  category,
}: {
  posts: CommunityPostRow[];
  neighborhoodName: string | null;
  category: CommunityCategory | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel("community-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_posts" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  // 동네 미설정 안내
  if (!neighborhoodName) {
    return (
      <div className="flex flex-1 flex-col bg-white">
        <Header neighborhoodName={null} />
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <span className="mb-3 text-5xl" aria-hidden>
            📍
          </span>
          <p className="text-[16px] font-bold text-zinc-900">
            동네를 먼저 설정해주세요
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
            같은 동네 이웃들과만
            <br />
            이야기를 나눌 수 있어요.
          </p>
          <Link
            href={"/onboarding/address" as any}
            className="mt-6 rounded-full bg-brand px-6 py-3 text-[15px] font-bold text-white active:scale-95"
          >
            동네 설정하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-white pb-24">
      <Header neighborhoodName={neighborhoodName} />

      {/* 카테고리 칩 (가로 스크롤) */}
      <div className="sticky top-0 z-20 border-b border-zinc-100 bg-white">
        <div className="flex gap-2 overflow-x-auto px-5 py-3 [&::-webkit-scrollbar]:hidden">
          <Chip label="전체" active={category === null} href="/community" />
          {COMMUNITY_CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              label={`${c.emoji} ${c.label}`}
              active={category === c.value}
              href={`/community?category=${c.value}`}
            />
          ))}
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <span className="mb-3 text-5xl" aria-hidden>
            🌱
          </span>
          <p className="text-[16px] font-bold text-zinc-900">아직 글이 없어요</p>
          <p className="mt-1.5 text-[14px] text-zinc-400">
            이웃들에게 첫 이야기를 남겨보세요!
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {posts.map((p) => (
            <PostRow key={p.id} post={p} />
          ))}
        </ul>
      )}

      {/* 글쓰기 FAB — 아이콘(+)만. 홈(feed) FAB와 동일한 위치/스타일. */}
      <Link
        href={"/community/new" as any}
        aria-label="글쓰기"
        className="fixed bottom-20 right-[max(1rem,calc(50%-13rem))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-emerald-500/30 transition-transform active:scale-95"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  );
}

function Header({ neighborhoodName }: { neighborhoodName: string | null }) {
  return (
    <header className="bg-white px-5 pb-3 pt-4">
      <h1 className="text-[24px] font-extrabold tracking-tight text-zinc-900">
        커뮤니티
      </h1>
      {neighborhoodName && (
        <p className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-brand-dark">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
          </svg>
          {neighborhoodName} 이웃들의 이야기
        </p>
      )}
    </header>
  );
}

function Chip({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href as any}
      className={cn(
        "flex shrink-0 items-center rounded-full px-4 py-2 text-[14px] font-semibold transition",
        active
          ? "bg-zinc-900 text-white"
          : "border border-zinc-200 bg-white text-zinc-500 active:bg-zinc-50",
      )}
    >
      {label}
    </Link>
  );
}

function PostRow({ post }: { post: CommunityPostRow }) {
  const cat = communityCategoryMeta(post.category);
  const thumb = post.image_urls[0] ?? null;
  const hot = post.like_count >= HOT_THRESHOLD;
  return (
    <li>
      <Link
        href={`/community/${post.id}` as any}
        className="flex gap-4 border-b border-zinc-100 px-5 py-5 active:bg-zinc-50"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 뱃지 */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {hot && (
              <span className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[12px] font-bold text-rose-500">
                🔥 지금 주목받는
              </span>
            )}
            <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[12px] font-medium text-zinc-500">
              {cat.emoji} {cat.label}
            </span>
          </div>

          <p className="line-clamp-2 text-[17px] font-bold leading-snug text-zinc-900">
            {post.title}
          </p>

          {/* 작성자 메타 */}
          <div className="mt-2 flex items-center gap-1.5 text-[13px] text-zinc-400">
            <CommunityAvatar name={post.author.nickname} size={20} />
            <span className="font-medium text-zinc-500">
              {post.author.nickname}
            </span>
            <span aria-hidden>{levelEmoji(post.author.level)}</span>
            <span>·</span>
            <span>{timeAgo(post.created_at)}</span>
          </div>
        </div>

        {/* 우측: 썸네일 + 카운트 */}
        <div className="flex shrink-0 flex-col items-end justify-between">
          {thumb ? (
            <div className="relative h-[92px] w-[92px] overflow-hidden rounded-2xl bg-zinc-100">
              <Image src={thumb} alt="" fill sizes="92px" className="object-cover" />
              {post.image_urls.length > 1 && (
                <span className="absolute bottom-1 right-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  +{post.image_urls.length - 1}
                </span>
              )}
            </div>
          ) : (
            <span />
          )}
          <div className="mt-2 flex items-center gap-2.5 text-[13px] text-zinc-400">
            <span
              className={cn(
                "flex items-center gap-1",
                post.liked_by_me && "text-rose-500",
              )}
            >
              <HeartMini filled={post.liked_by_me} /> {post.like_count}
            </span>
            <span className="flex items-center gap-1">
              <CommentMini /> {post.comment_count}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function HeartMini({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden>
      <path
        d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentMini() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.8 6.2A1.8 1.8 0 0 1 6.6 4.5h10.8a1.8 1.8 0 0 1 1.8 1.7V14a1.8 1.8 0 0 1-1.8 1.8h-6.2L7 18.8a.5.5 0 0 1-.8-.4v-2.6A1.8 1.8 0 0 1 4.8 14V6.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
