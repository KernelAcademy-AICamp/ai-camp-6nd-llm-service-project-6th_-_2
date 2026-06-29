"use client";

// 홈 프로모션 배너(좌우 스와이프 캐러셀) + 통합 검색창.
// - 현재는 복숭아 공구 1장만 노출. BANNERS 배열에 항목을 추가하면 자동으로 캐러셀(스와이프·자동전환·점 인디케이터)이 동작한다.
// - 문구·가격·색상·CTA·href 는 BANNERS 데이터로 한 곳에서 교체 가능. 오른쪽 비주얼은 banner.type 으로 분기.
// - 배너 전체를 이미지로 넣지 않고 텍스트/버튼/인디케이터는 HTML 요소로 구현(복숭아만 상품 사진).
// 폭/좌우 패딩은 부모(피드의 p-4 컨테이너 · (app) 레이아웃 max-w-md)가 제공한다.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type BannerType = "peach";

type Banner = {
  id: string;
  type: BannerType;
  label: string;
  line1: string;
  line2: string;
  cta: string;
  href: string;
  indicator: string;
  /** 좌측 밝은 색 → 우측 진한 색 그라데이션 */
  bgClass: string;
  /** 라벨 텍스트 색 */
  labelClass: string;
  /** 메인 카피 2번째 줄 강조색 */
  accentClass: string;
};

const BANNERS: Banner[] = [
  {
    id: "peach",
    type: "peach",
    label: "🍑 띵동 단독 공구",
    line1: "노지 신비복숭아",
    line2: "공구가 21,900원~",
    cta: "공구 참여하기",
    href: "/groupbuy/sinbi-peach",
    indicator: "",
    bgClass: "bg-gradient-to-r from-rose-50 via-rose-50 to-rose-100",
    labelClass: "text-rose-500",
    accentClass: "text-rose-500",
  },
];

const INTERVAL_MS = 6000;
const SWIPE_THRESHOLD = 45; // 이 px 이상 끌면 슬라이드 전환
const DRAG_GUARD = 8; // 이 px 이상 움직이면 "드래그"로 보고 탭(링크 이동) 무시

export function HomeHeroBanners({
  query,
  onClear,
}: {
  /** 검색창에 표시할 현재 검색어(있으면 placeholder 대신 노출) */
  query?: string;
  /** 검색어 지우기 핸들러(있을 때만 X 버튼 노출) */
  onClear?: () => void;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const movedRef = useRef(false); // 드래그 발생 여부(클릭 가드용)

  // 자동 전환 — 드래그 중이거나 배너가 1장이면 멈춤. idx 바뀔 때마다 타이머 리셋.
  useEffect(() => {
    if (dragging || BANNERS.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % BANNERS.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [dragging, idx]);

  function onPointerDown(e: React.PointerEvent) {
    setDragging(true);
    movedRef.current = false;
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > DRAG_GUARD) movedRef.current = true;
    setDragPx(dx);
  }
  function endDrag() {
    if (!dragging) return;
    setDragging(false);
    const dx = dragPx;
    setDragPx(0);
    if (dx <= -SWIPE_THRESHOLD) {
      setIdx((i) => (i + 1) % BANNERS.length); // 왼쪽으로 끌면 다음
    } else if (dx >= SWIPE_THRESHOLD) {
      setIdx((i) => (i - 1 + BANNERS.length) % BANNERS.length); // 오른쪽으로 끌면 이전
    } else if (!movedRef.current) {
      // 끌지 않은 탭 → 현재 배너로 이동. (포인터 캡처가 자식 Link click을 막을 수 있어 직접 라우팅)
      router.push(BANNERS[idx].href as never);
    }
  }
  // click은 직접 라우팅으로 처리하므로 Link 기본 동작은 항상 막는다(중복/오동작 방지).
  function onClickCapture(e: React.MouseEvent) {
    e.preventDefault();
  }

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {/* 스와이프 캐러셀 — 한 번에 한 장 */}
        <div
          className="relative h-[160px] select-none overflow-hidden rounded-[18px]"
          style={{ touchAction: "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onClickCapture}
        >
          <div
            className={cn(
              "flex h-full",
              !dragging && "transition-transform duration-300 ease-out",
            )}
            style={{ transform: `translateX(calc(${-idx * 100}% + ${dragPx}px))` }}
          >
            {BANNERS.map((b) => (
              <div key={b.id} className="h-full w-full shrink-0">
                <PromoBannerCard banner={b} />
              </div>
            ))}
          </div>
        </div>

        {/* 점 인디케이터 (여러 장일 때만) */}
        {BANNERS.length > 1 && (
          <div className="flex items-center justify-center gap-1.5">
            {BANNERS.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`${i + 1}번 배너`}
                onClick={() => setIdx(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === idx ? "w-4 bg-zinc-700" : "w-1.5 bg-zinc-300",
                )}
              />
            ))}
          </div>
        )}
      </div>

      <SearchBox query={query} onClear={onClear} />
    </>
  );
}

// ── 배너 카드 한 장 ──────────────────────────────────────────────
function PromoBannerCard({ banner }: { banner: Banner }) {
  return (
    <Link
      href={banner.href as never}
      draggable={false}
      className={cn(
        "relative block h-full w-full overflow-hidden rounded-[18px]",
        banner.bgClass,
      )}
    >
      {/* 왼쪽 텍스트 */}
      <div className="relative z-10 flex h-full max-w-[60%] flex-col justify-center pl-5">
        <span className={cn("text-[12px] font-bold", banner.labelClass)}>
          {banner.label}
        </span>
        <span className="mt-1.5 text-[21px] font-extrabold leading-tight tracking-tight text-zinc-900">
          {banner.line1}
        </span>
        <span
          className={cn(
            "text-[21px] font-extrabold leading-tight tracking-tight",
            banner.accentClass,
          )}
        >
          {banner.line2}
        </span>
        <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-bold text-white">
          {banner.cta}
          <DownIcon />
        </span>
      </div>

      {/* 오른쪽 비주얼 */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[44%]">
        {banner.type === "peach" && <PeachObject />}
      </div>

      {/* 우측 하단 인디케이터 (여러 장일 때만) */}
      {banner.indicator && (
        <span className="absolute bottom-3 right-3 z-10 rounded-full bg-zinc-900/25 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
          {banner.indicator}
        </span>
      )}
    </Link>
  );
}

// ── 오브젝트: 복숭아 공구 — 실제 상품 사진(우측 채움 + 좌측 페이드) ──
function PeachObject() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/peach_photo_crop.png"
        alt=""
        draggable={false}
        className="absolute inset-y-0 right-0 h-full w-[132%] object-cover"
      />
      {/* 좌측 페이드 — 사진을 배너 핑크 배경에 자연스럽게 잇는다 */}
      <div className="absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-rose-50 to-transparent" />
    </>
  );
}

// ── CTA 다운로드형 화살표 ────────────────────────────────────────
function DownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v11m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── 통합 검색창 ─────────────────────────────────────────────────
function SearchBox({
  query,
  onClear,
}: {
  query?: string;
  onClear?: () => void;
}) {
  return (
    <div className="relative">
      <Link
        href={"/feed/search" as never}
        className="flex h-12 w-full items-center rounded-2xl border border-zinc-200 bg-white pl-10 pr-9 text-[13px] active:bg-zinc-50"
      >
        <span className={query ? "truncate text-zinc-800" : "text-zinc-400"}>
          {query || "배달·장보기 통합 검색 (가게명 또는 메뉴)"}
        </span>
      </Link>
      <span
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
        aria-hidden
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path
            d="M20 20l-3.5-3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {query && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="검색어 지우기"
          className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 active:bg-zinc-200"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
