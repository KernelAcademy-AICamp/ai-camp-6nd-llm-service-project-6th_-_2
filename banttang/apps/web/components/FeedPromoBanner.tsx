"use client";

// 홈 상단 프로모션 배너 — 검색창 위, 화면 좌우 꽉 채우는(풀블리드) 사각 배너.
// 마우스 드래그 / 터치 스와이프로 슬라이드 전환 + 자동 전환 + 우하단 n/total 카운터.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Promo = {
  label: string;
  line1: string;
  highlight: string;
  cta: string;
  href: string;
  leftBg: string;
  rightBg: string;
  art?: boolean;
};

const PROMOS: Promo[] = [
  {
    label: "🍑 띵동 단독 공구",
    line1: "노지 신비복숭아",
    highlight: "공구가 21,900원~",
    cta: "공구 참여하기",
    href: "/groupbuy/sinbi-peach",
    leftBg: "bg-rose-50",
    rightBg: "bg-gradient-to-br from-rose-100 to-pink-200",
    art: true,
  },
  {
    label: "선착순 혜택 쿠폰",
    line1: "뛰어가세요",
    highlight: "12만원 할인?!",
    cta: "COUPON",
    href: "/store",
    leftBg: "bg-zinc-100",
    rightBg: "bg-gradient-to-br from-indigo-300 to-sky-400",
  },
  {
    label: "우리 동네 공동구매",
    line1: "같이 사면",
    highlight: "최대 반값!",
    cta: "주문 보기",
    href: "/feed",
    leftBg: "bg-emerald-50",
    rightBg: "bg-gradient-to-br from-emerald-300 to-teal-400",
  },
  {
    label: "첫 거래 신규 혜택",
    line1: "거래 완료하면",
    highlight: "3,000원 적립",
    cta: "혜택 받기",
    href: "/store",
    leftBg: "bg-rose-50",
    rightBg: "bg-gradient-to-br from-rose-300 to-orange-400",
  },
];

const INTERVAL_MS = 7000;
const SWIPE_THRESHOLD = 45; // 이 px 이상 끌면 슬라이드 전환
const DRAG_GUARD = 8; // 이 px 이상 움직이면 "드래그"로 보고 링크 이동 막음

export function FeedPromoBanner() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startX = useRef(0);
  const movedRef = useRef(false); // 드래그 발생 여부 (클릭 가드용)

  // 자동 전환 — 드래그 중엔 멈춤. idx 바뀔 때마다 타이머 리셋(수동 전환 후 풀 인터벌).
  useEffect(() => {
    if (dragging) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % PROMOS.length),
      INTERVAL_MS,
    );
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
      setIdx((i) => (i + 1) % PROMOS.length); // 왼쪽으로 → 다음
    } else if (dx >= SWIPE_THRESHOLD) {
      setIdx((i) => (i - 1 + PROMOS.length) % PROMOS.length); // 오른쪽으로 → 이전
    } else if (!movedRef.current) {
      // 끌지 않은 탭 → 현재 슬라이드로 이동.
      // (setPointerCapture가 자식 Link의 click을 막을 수 있어 직접 라우팅)
      router.push(PROMOS[idx].href as any);
    }
  }
  // click은 직접 라우팅으로 처리하므로 Link 기본 동작은 항상 막는다(중복/오동작 방지).
  function onClickCapture(e: React.MouseEvent) {
    e.preventDefault();
  }

  return (
    <div
      className="relative -mx-4 -mt-4 h-44 select-none overflow-hidden"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
    >
      {/* 슬라이드 트랙 */}
      <div
        className={cn(
          "flex h-full",
          !dragging && "transition-transform duration-300 ease-out",
        )}
        style={{ transform: `translateX(calc(${-idx * 100}% + ${dragPx}px))` }}
      >
        {PROMOS.map((promo) => (
          <Slide key={promo.href + promo.line1} promo={promo} />
        ))}
      </div>

      {/* n/total 카운터 pill */}
      <span className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-[12px] font-semibold text-white backdrop-blur">
        {idx + 1} / {PROMOS.length}
        <span className="opacity-70">+</span>
      </span>
    </div>
  );
}

function Slide({ promo }: { promo: Promo }) {
  return (
    <Link
      href={promo.href as any}
      draggable={false}
      className={cn(
        "relative flex h-full w-full shrink-0 overflow-hidden",
        promo.leftBg,
      )}
    >
      {/* 왼쪽 텍스트 */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-5">
        <span className="text-[13px] font-semibold text-zinc-500">
          {promo.label}
        </span>
        <span className="mt-1 text-[26px] font-extrabold leading-tight text-zinc-900">
          {promo.line1}
        </span>
        <span className="text-[26px] font-extrabold leading-tight text-rose-500">
          {promo.highlight}
        </span>
        <span className="mt-3 inline-flex w-fit items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-[14px] font-bold text-white">
          {promo.cta}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 4v11m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </div>

      {/* 오른쪽 — 일러스트 또는 그라데이션 */}
      <div
        className={cn(
          "absolute right-0 top-0 flex h-full w-[46%] items-end justify-center",
          promo.rightBg,
        )}
        aria-hidden
      >
        {promo.art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/images/peach_photo_crop.png"
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-16 bg-gradient-to-r to-transparent",
            promo.leftBg === "bg-zinc-100"
              ? "from-zinc-100"
              : promo.leftBg === "bg-emerald-50"
                ? "from-emerald-50"
                : "from-rose-50",
          )}
        />
      </div>
    </Link>
  );
}
