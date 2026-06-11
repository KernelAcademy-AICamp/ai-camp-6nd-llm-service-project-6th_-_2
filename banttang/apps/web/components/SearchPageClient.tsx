"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { partyPhotoUrl } from "@/lib/storage";
import { StoreThumb } from "./StoreThumb";

// ─── localStorage 키 ───
const KEY_RECENT_SEARCHES = "feed:recent-searches";
const KEY_RECENT_VIEWED = "feed:recent-viewed";

const SUGGESTED = [
  "치킨",
  "피자",
  "커피",
  "도미노",
  "다이소",
  "편의점",
  "컬리",
  "쿠팡",
  "배달",
  "장보기",
];

interface ViewedItem {
  id: string;
  store_name: string;
  /** photo_paths의 첫 번째 경로 (사용자 등록 사진). 없으면 StoreThumb 폴백. */
  photo_path?: string | null;
  representative_menu?: string | null;
  viewed_at: string;
}

function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY_RECENT_SEARCHES);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(arr: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_RECENT_SEARCHES, JSON.stringify(arr));
  } catch {
    // private mode 등 — 무시
  }
}

function readRecentViewed(): ViewedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY_RECENT_VIEWED);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is ViewedItem =>
        !!x &&
        typeof x === "object" &&
        typeof (x as any).id === "string" &&
        typeof (x as any).store_name === "string",
    );
  } catch {
    return [];
  }
}

function writeRecentViewed(arr: ViewedItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_RECENT_VIEWED, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

// 페이지 외부에서 호출 — PartyDetailClient 마운트 시 사용
export function pushRecentViewed(item: {
  id: string;
  store_name: string;
  photo_path?: string | null;
  representative_menu?: string | null;
}) {
  const cur = readRecentViewed().filter((v) => v.id !== item.id);
  const next: ViewedItem[] = [
    {
      id: item.id,
      store_name: item.store_name,
      photo_path: item.photo_path ?? null,
      representative_menu: item.representative_menu ?? null,
      viewed_at: new Date().toISOString(),
    },
    ...cur,
  ].slice(0, 10);
  writeRecentViewed(next);
}

export function SearchPageClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const [viewed, setViewed] = useState<ViewedItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // 마운트 시 localStorage 로드 + 입력란 자동 포커스
  useEffect(() => {
    setRecents(readRecentSearches());
    setViewed(readRecentViewed());
    inputRef.current?.focus();
  }, []);

  function submit(rawTerm?: string) {
    const term = (rawTerm ?? query).trim();
    if (!term) return;
    // 최근 검색어에 추가 (중복 제거 + 최신 우선, 10개 cap)
    const cur = readRecentSearches().filter((s) => s !== term);
    const next = [term, ...cur].slice(0, 10);
    writeRecentSearches(next);
    setRecents(next);
    // /feed?q=term 으로 이동
    router.push(`/feed?q=${encodeURIComponent(term)}` as any);
  }

  function removeRecent(term: string) {
    const next = recents.filter((s) => s !== term);
    setRecents(next);
    writeRecentSearches(next);
  }

  function clearAllRecents() {
    setRecents([]);
    writeRecentSearches([]);
  }

  function removeViewed(id: string) {
    const next = viewed.filter((v) => v.id !== id);
    setViewed(next);
    writeRecentViewed(next);
  }

  function clearAllViewed() {
    setViewed([]);
    writeRecentViewed([]);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* 헤더 — ← + 입력 (자동 포커스) */}
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-white px-3 py-2.5">
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
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="가게명 또는 메뉴 검색"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-9 text-[13px] focus:border-brand focus:bg-white focus:outline-none"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 active:bg-zinc-200"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </form>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-4 pb-24">
        {/* 최근 검색어 */}
        <section>
          <SectionHeader title="최근 검색어">
            {recents.length > 0 && (
              <button
                type="button"
                onClick={clearAllRecents}
                className="text-[12px] text-zinc-400 active:text-zinc-600"
              >
                전체 삭제
              </button>
            )}
          </SectionHeader>
          {recents.length === 0 ? (
            <p className="text-[12px] text-zinc-400">최근 검색 내역이 없어요.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {recents.map((s) => (
                <li key={s}>
                  <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white pl-3 pr-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => submit(s)}
                      className="text-[13px] text-zinc-700"
                    >
                      {s}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecent(s)}
                      aria-label={`${s} 삭제`}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 active:bg-zinc-100"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 최근 본 목록 — 가로 스크롤 이미지 카드. 최근 클릭한 게 왼쪽. */}
        <section>
          <SectionHeader title="최근 본 목록">
            {viewed.length > 0 && (
              <button
                type="button"
                onClick={clearAllViewed}
                className="text-[12px] text-zinc-400 active:text-zinc-600"
              >
                전체 삭제
              </button>
            )}
          </SectionHeader>
          {viewed.length === 0 ? (
            <p className="text-[12px] text-zinc-400">최근 본 주문이 없어요.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <ul className="flex gap-3 px-4">
                {viewed.map((v) => (
                  <li key={v.id} className="relative w-[112px] shrink-0">
                    <Link
                      href={`/feed/${v.id}` as any}
                      className="block"
                    >
                      <div className="aspect-square w-full overflow-hidden rounded-xl bg-brand-50 ring-1 ring-black/[0.04]">
                        {v.photo_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={partyPhotoUrl(v.photo_path)}
                            alt={v.store_name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <StoreThumb
                            storeName={v.store_name}
                            menu={v.representative_menu}
                          />
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[12px] font-medium text-zinc-700">
                        {v.store_name}
                      </p>
                    </Link>
                    {/* 개별 X — 우상단 작은 버튼 */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        removeViewed(v.id);
                      }}
                      aria-label="삭제"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-white active:bg-black/60"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6 6l12 12M18 6 6 18"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 추천 검색어 */}
        <section>
          <SectionHeader title="추천 검색어">
            <span className="text-[11px] text-zinc-400">최근 탐색 기반</span>
          </SectionHeader>
          <p className="mb-2 text-[11px] leading-relaxed text-zinc-400">
            그동안 찾은 검색어와 탐색 기반으로 키워드를 추천해요.
          </p>
          <ul className="flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full bg-sky-50 px-3 py-1.5 text-[13px] font-medium text-sky-700 active:bg-sky-100"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function SectionHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-[14px] font-bold text-zinc-900">{title}</h2>
      {children}
    </div>
  );
}
