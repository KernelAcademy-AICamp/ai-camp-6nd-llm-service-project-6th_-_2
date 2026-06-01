"use client";

// 모집글 상품 사진 갤러리 — 썸네일(작게) + 클릭 시 풀스크린 프리뷰.
// 다중 사진은 가로 스크롤 + 프리뷰 안에서 좌우 화살표/카운터로 이동.

import { useCallback, useEffect, useState } from "react";
import { partyPhotoUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function PartyPhotosGallery({
  paths,
  alt,
}: {
  paths: string[];
  alt: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (paths.length === 0) return null;

  return (
    <>
      {/* 썸네일 — 128px 정사각형 (당근 마켓 스타일). 원본은 탭하면 프리뷰에서 비율 유지. */}
      <section className="-mx-4 overflow-x-auto pb-1">
        <div className="flex gap-2 px-4">
          {paths.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setOpenIndex(i)}
              className="relative aspect-square w-32 shrink-0 overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-black/[0.04] transition-transform active:scale-[0.97]"
              aria-label={`${alt} 사진 ${i + 1} 크게 보기`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={partyPhotoUrl(p)}
                alt={`${alt} 사진 ${i + 1}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </section>

      {openIndex !== null && (
        <PhotoPreview
          paths={paths}
          alt={alt}
          initialIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}

function PhotoPreview({
  paths,
  alt,
  initialIndex,
  onClose,
}: {
  paths: string[];
  alt: string;
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const total = paths.length;

  const next = useCallback(
    () => setIndex((i) => (i + 1) % total),
    [total],
  );
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + total) % total),
    [total],
  );

  // ESC 닫기 + ←/→ 이동 + 스크롤 잠금
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [next, prev, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 backdrop-blur-sm"
    >
      {/* 상단 바 — 닫기 + 인덱스 표기 */}
      <header className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-3 text-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white active:bg-white/10"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {total > 1 && (
          <span className="text-[13px] font-semibold tabular-nums">
            {index + 1} / {total}
          </span>
        )}
        <span className="w-10" aria-hidden /> {/* 좌우 정렬 균형 */}
      </header>

      {/* 이미지 영역 */}
      <div
        className="relative flex flex-1 items-center justify-center px-4 pb-4"
        onClick={(e) => {
          // 빈 영역 클릭으로 닫기 (이미지 자체 클릭은 무시)
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={partyPhotoUrl(paths[index])}
          alt={`${alt} 사진 ${index + 1}`}
          className="max-h-full max-w-full object-contain"
        />

        {/* 좌/우 이동 — 사진 2장 이상일 때만 */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="이전"
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur active:bg-white/25"
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="다음"
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur active:bg-white/25"
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>

      {/* 하단 인디케이터 — 점 (다중일 때만) */}
      {total > 1 && (
        <footer className="flex justify-center gap-1.5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-1">
          {paths.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                i === index ? "bg-white" : "bg-white/30",
              )}
              aria-hidden
            />
          ))}
        </footer>
      )}
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
