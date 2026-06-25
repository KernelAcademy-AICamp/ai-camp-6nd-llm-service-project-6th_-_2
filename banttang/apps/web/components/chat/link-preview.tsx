"use client";

// 채팅 메시지 안의 URL을 OG 메타로 카드화하는 프리뷰.
// /api/og 에서 메타를 받아 제목/설명/썸네일을 보여준다. 모듈 캐시로 중복 요청 방지.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface OgMeta {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  price?: string | null;
  source?: "og" | "naver_shopping" | null;
  siteName?: string | null;
}

// url → 메타(또는 진행중 Promise) 캐시
const cache = new Map<string, OgMeta | null>();
const inflight = new Map<string, Promise<OgMeta | null>>();

async function fetchOg(url: string): Promise<OgMeta | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  if (inflight.has(url)) return inflight.get(url)!;
  const p = (async () => {
    try {
      // 브라우저 HTTP 캐시 우회 — 같은 세션 중복은 아래 모듈 캐시(cache Map)가 막는다.
      // (HTTP 캐시에 의존하면 과거의 '빈 결과'가 오래 재사용되는 문제가 있어 no-store)
      const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        cache.set(url, null);
        return null;
      }
      const data = (await res.json()) as OgMeta;
      // 보여줄 게 아무것도 없으면 카드 생략
      const meta =
        data.title || data.description || data.image || data.price ? data : null;
      cache.set(url, meta);
      return meta;
    } catch {
      cache.set(url, null);
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

export function LinkPreview({ url, mine }: { url: string; mine?: boolean }) {
  const [meta, setMeta] = useState<OgMeta | null | undefined>(() =>
    cache.has(url) ? cache.get(url) : undefined,
  );

  useEffect(() => {
    if (cache.has(url)) {
      setMeta(cache.get(url));
      return;
    }
    let alive = true;
    fetchOg(url).then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, [url]);

  // 로딩 중: 가벼운 스켈레톤
  if (meta === undefined) {
    return (
      <div
        className={cn(
          "w-56 max-w-[78vw] animate-pulse overflow-hidden rounded-xl border border-black/[0.06] bg-white",
          mine ? "self-end" : "self-start",
        )}
      >
        <div className="h-28 w-full bg-zinc-100" />
        <div className="space-y-1.5 p-2.5">
          <div className="h-3 w-3/4 rounded bg-zinc-100" />
          <div className="h-2.5 w-1/2 rounded bg-zinc-100" />
        </div>
      </div>
    );
  }

  // 메타 없음 → 카드 미표시
  if (!meta) return null;

  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block w-56 max-w-[78vw] overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-sm transition-opacity active:opacity-80",
        mine ? "self-end" : "self-start",
      )}
    >
      {meta.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.image}
          alt=""
          className="h-28 w-full bg-zinc-100 object-cover"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="p-2.5">
        {meta.title && (
          <p className="line-clamp-2 text-[13px] font-bold leading-snug text-zinc-900">
            {meta.title}
          </p>
        )}
        {meta.price && (
          <p className="mt-1 text-[14px] font-extrabold text-zinc-900">{meta.price}</p>
        )}
        {meta.description && !meta.price && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-zinc-500">
            {meta.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          {meta.siteName && (
            <p className="truncate text-[11px] text-zinc-400">{meta.siteName}</p>
          )}
          {meta.source === "naver_shopping" && (
            <span className="shrink-0 rounded-sm bg-[#03C75A]/10 px-1.5 py-px text-[10px] font-bold text-[#03C75A]">
              네이버쇼핑
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
