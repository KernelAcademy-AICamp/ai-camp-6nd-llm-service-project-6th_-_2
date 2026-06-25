"use client";

// 스토어 검색 화면 — 홈(feed) 검색(SearchPageClient)과 동일 패턴.
// 최근 검색어 + 추천 검색어. 입력/칩 선택 시 /store?q=... 로 이동(기존 결과 화면 재사용).
// 스토어 카드는 외부(네이버)로 나가 상세 뷰가 없으므로 "최근 본 목록" 섹션은 제외.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const KEY_RECENT_SEARCHES = "store:recent-searches";

// 스토어 성격(음식점 + 쇼핑)에 맞춘 추천 키워드 (정적).
const SUGGESTED = [
  "치킨",
  "피자",
  "커피",
  "세제",
  "휴지",
  "프로틴",
  "닭가슴살",
  "생수",
  "다이소",
  "코스트코",
];

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

export function StoreSearchPageClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecents(readRecentSearches());
    inputRef.current?.focus();
  }, []);

  function submit(rawTerm?: string) {
    const term = (rawTerm ?? query).trim();
    if (!term) return;
    const cur = readRecentSearches().filter((s) => s !== term);
    const next = [term, ...cur].slice(0, 10);
    writeRecentSearches(next);
    setRecents(next);
    router.push(`/store?q=${encodeURIComponent(term)}` as any);
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

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* 헤더 — ← + 입력(자동 포커스) */}
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
            placeholder="상품·음식점 검색"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-9 text-[13px] focus:border-brand focus:bg-white focus:outline-none"
          />
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden
          >
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
                  <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white py-1.5 pl-3 pr-1">
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

        {/* 추천 검색어 */}
        <section>
          <SectionHeader title="추천 검색어">
            <span className="text-[11px] text-zinc-400">스토어 인기 키워드</span>
          </SectionHeader>
          <p className="mb-2 text-[11px] leading-relaxed text-zinc-400">
            음식점·쇼핑에서 자주 찾는 키워드예요.
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
