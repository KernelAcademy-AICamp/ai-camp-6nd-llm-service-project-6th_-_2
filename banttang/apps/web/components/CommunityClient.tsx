"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  COMMUNITY_CATEGORIES,
  communityCategoryMeta,
  type CommunityCategory,
  type CommunityPostRow,
} from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import {
  mockResidenceMemberCount,
  residenceJoinedKey,
  MOCK_LAST_MESSAGE,
  MOCK_LAST_TIME,
} from "@/lib/residence-room";
import { CommunityAvatar, levelEmoji } from "./CommunityAvatar";

// 🔥 인기글 기준 (좋아요 수)
const HOT_THRESHOLD = 5;

export function CommunityClient({
  posts,
  neighborhoodName,
  category,
  scope = "all",
  residence = null,
}: {
  posts: CommunityPostRow[];
  neighborhoodName: string | null;
  category: CommunityCategory | null;
  scope?: "all" | "residence";
  residence?: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // scope·category 보존하며 링크 생성
  const buildHref = (next: {
    scope?: "all" | "residence";
    category?: CommunityCategory | null;
  }): string => {
    const s = next.scope ?? scope;
    const c = next.category === undefined ? category : next.category;
    const p = new URLSearchParams();
    if (s === "residence") p.set("scope", "residence");
    if (c) p.set("category", c);
    const qs = p.toString();
    return qs ? `/community?${qs}` : "/community";
  };

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

      {/* 큰 탭: 전체글 | 거주지(건물명) */}
      <div className="flex border-b border-zinc-200 px-2">
        <BigTab label="전체글" active={scope === "all"} href={buildHref({ scope: "all" })} />
        {residence ? (
          <BigTab
            label={residence}
            active={scope === "residence"}
            href={buildHref({ scope: "residence" })}
          />
        ) : (
          <BigTab label="거주지 설정" active={false} href="/onboarding/address" muted />
        )}
      </div>

      {/* 거주지 탭 상단: 우리 건물 채팅방 입장 (게시글은 그 아래) */}
      {scope === "residence" && residence && (
        <ResidenceRoomEntry residence={residence} />
      )}

      {/* 카테고리 칩 (가로 스크롤) */}
      <div className="sticky top-0 z-20 border-b border-zinc-100 bg-white">
        <div className="flex gap-2 overflow-x-auto px-5 py-3 [&::-webkit-scrollbar]:hidden">
          <Chip
            label="전체"
            active={category === null}
            href={buildHref({ category: null })}
          />
          {COMMUNITY_CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              label={`${c.emoji} ${c.label}`}
              active={category === c.value}
              href={buildHref({ category: c.value })}
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

// 거주지 탭 상단 — 우리 건물 채팅방.
// 미입장: [입장] 버튼 → 확인 모달 → 입장하면 버튼이 사라지고 최근 메시지가 뜬다.
// 입장 상태는 목업이라 localStorage 로 기억(백엔드 연동 시 멤버십으로 교체).
function ResidenceRoomEntry({ residence }: { residence: string }) {
  const router = useRouter();
  const count = mockResidenceMemberCount(residence);
  const storageKey = residenceJoinedKey(residence);
  const [joined, setJoined] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    try {
      setJoined(localStorage.getItem(storageKey) === "1");
    } catch {
      /* localStorage 불가 환경 무시 */
    }
  }, [storageKey]);

  function confirmJoin() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* 무시 */
    }
    setJoined(true);
    setAskOpen(false);
    // 입장하면 바로 우리 건물 채팅방을 연다.
    router.push("/chat/residence" as never);
  }

  const iconAndName = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#5B6CF0]">
        <BuildingIcon />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-[16px] font-bold text-zinc-900">{residence}</span>
          <span className="shrink-0 text-[13px] font-semibold text-zinc-400">{count}</span>
        </span>
        {joined && (
          <span className="mt-0.5 truncate text-[13px] text-zinc-400">{MOCK_LAST_MESSAGE}</span>
        )}
      </span>
    </>
  );

  return (
    <div className="px-4 pb-3 pt-3">
      <p className="mb-2 px-1 text-[12px] font-bold text-zinc-400">우리 건물 채팅방</p>

      {joined ? (
        // 입장 완료 — 행 전체가 채팅방으로 가는 링크 + 최근 메시지/시간
        <Link
          href={"/chat/residence" as any}
          className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3.5 py-3 active:bg-zinc-50"
        >
          {iconAndName}
          <span className="shrink-0 self-start text-[11px] text-zinc-300">{MOCK_LAST_TIME}</span>
        </Link>
      ) : (
        // 미입장 — [입장] 버튼이 확인 모달을 띄움
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3.5 py-3">
          {iconAndName}
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="shrink-0 rounded-lg bg-zinc-100 px-4 py-2 text-[14px] font-bold text-zinc-700 active:bg-zinc-200"
          >
            입장
          </button>
        </div>
      )}

      {/* 입장 확인 모달 */}
      {askOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-10"
          onClick={() => setAskOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-[300px] rounded-2xl bg-white p-5 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#5B6CF0]">
              <BuildingIcon />
            </span>
            <p className="mt-3 text-[16px] font-bold text-zinc-900">{residence}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-zinc-500">
              같은 건물 이웃들의 채팅방이에요.
              <br />
              입장하시겠어요?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setAskOpen(false)}
                className="flex-1 rounded-xl bg-zinc-100 py-3 text-[15px] font-bold text-zinc-600 active:bg-zinc-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmJoin}
                className="flex-1 rounded-xl bg-brand py-3 text-[15px] font-bold text-white active:scale-[0.98]"
              >
                입장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 오피스텔/빌라/고시원 같은 단일 다층 주거건물 아이콘 (창문 4개 + 출입문).
function BuildingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5.5 21V5.2A1.2 1.2 0 0 1 6.7 4h10.6A1.2 1.2 0 0 1 18.5 5.2V21" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3.5 21h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 21v-3a2 2 0 0 1 4 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="7.8" y="7" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="13.6" y="7" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="7.8" y="11.6" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="13.6" y="11.6" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
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

function BigTab({
  label,
  active,
  href,
  muted = false,
}: {
  label: string;
  active: boolean;
  href: string;
  muted?: boolean;
}) {
  return (
    <Link
      href={href as any}
      className={cn(
        "flex max-w-[55%] flex-1 items-center justify-center truncate border-b-2 px-3 py-3 text-[15px] font-bold",
        active
          ? "border-brand text-zinc-900"
          : muted
            ? "border-transparent text-zinc-300"
            : "border-transparent text-zinc-400",
      )}
    >
      {label}
    </Link>
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
