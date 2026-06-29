"use client";

// 홈 프로모션 배너(3종 좌우 스와이프 캐러셀) + 통합 검색창.
// - 전체 이미지가 아니라 텍스트/버튼/3D 오브젝트/인디케이터를 각각 HTML 요소로 구현.
// - 문구·가격·색상·CTA·오브젝트는 아래 BANNERS 데이터로 한 곳에서 교체 가능.
// - 오른쪽 비주얼은 banner.type 에 따라 CouponObject / RewardObject / GroceryObject 렌더.
// - 한 번에 한 장씩 노출, 터치 스와이프/마우스 드래그/자동 전환 + 하단 점 인디케이터.
// 폭/좌우 패딩은 부모(피드의 p-4 컨테이너 · (app) 레이아웃 max-w-md)가 제공한다.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type BannerType = "peach" | "coupon" | "reward" | "grocery";

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
    indicator: "1 / 4 +",
    bgClass: "bg-gradient-to-r from-rose-50 via-rose-50 to-rose-100",
    labelClass: "text-rose-500",
    accentClass: "text-rose-500",
  },
  {
    id: "coupon",
    type: "coupon",
    label: "첫 공구 참여 혜택",
    line1: "지금 참여하면",
    line2: "3,000원 쿠폰",
    cta: "",
    href: "/store",
    indicator: "2 / 4 +",
    bgClass: "bg-gradient-to-r from-sky-50 via-blue-50 to-blue-200",
    labelClass: "text-blue-500",
    accentClass: "text-blue-600",
  },
  {
    id: "reward",
    type: "reward",
    label: "첫 거래 신규 혜택",
    line1: "거래 완료하면",
    line2: "3,000원 적립",
    cta: "",
    href: "/store",
    indicator: "4 / 4 +",
    bgClass: "bg-gradient-to-r from-amber-50 via-orange-50 to-orange-200",
    labelClass: "text-orange-500",
    accentClass: "text-orange-500",
  },
  {
    id: "grocery",
    type: "grocery",
    label: "우리 동네 공동구매",
    line1: "같이 사면",
    line2: "최대 반값!",
    cta: "",
    href: "/feed",
    indicator: "3 / 4 +",
    bgClass: "bg-gradient-to-r from-green-50 via-emerald-50 to-emerald-200",
    labelClass: "text-emerald-600",
    accentClass: "text-emerald-600",
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

  // 자동 전환 — 드래그 중엔 멈춤. idx 바뀔 때마다 타이머 리셋.
  useEffect(() => {
    if (dragging) return;
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

        {/* 점 인디케이터 */}
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
        {/* CTA 버튼 — cta 가 있을 때만(복숭아). 나머지 배너는 버튼 없이 카드 전체가 링크. */}
        {banner.cta && (
          <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-bold text-white">
            {banner.cta}
            <DownIcon />
          </span>
        )}
      </div>

      {/* 오른쪽 3D 오브젝트 */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[44%]">
        {banner.type === "peach" && <PeachObject />}
        {banner.type === "coupon" && <CouponObject />}
        {banner.type === "reward" && <RewardObject />}
        {banner.type === "grocery" && <GroceryObject />}
      </div>

      {/* 우측 하단 인디케이터 */}
      <span className="absolute bottom-3 right-3 z-10 rounded-full bg-zinc-900/25 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
        {banner.indicator}
      </span>
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

// ── 오브젝트: 파란 쿠폰 티켓 2장 + 반짝이 ─────────────────────────
function CouponObject() {
  return (
    <div className="relative h-full w-full">
      {/* 뒤 티켓 — COUPON */}
      <Ticket
        className="absolute right-7 top-[34px] h-[58px] w-[104px] rotate-[-9deg] bg-gradient-to-br from-blue-200 to-blue-300"
        notchClass="bg-blue-100"
      >
        <span className="text-[12px] font-extrabold tracking-[0.18em] text-white/95">
          COUPON
        </span>
      </Ticket>

      {/* 앞 티켓 — 3,000원 */}
      <Ticket
        className="absolute right-[34px] top-[70px] h-[58px] w-[104px] rotate-[7deg] bg-gradient-to-br from-blue-500 to-blue-600 shadow-md shadow-blue-600/20"
        notchClass="bg-sky-50"
      >
        <span className="text-[16px] font-extrabold text-white">3,000원</span>
        <span className="text-[8px] font-bold tracking-[0.2em] text-white/75">
          COUPON
        </span>
      </Ticket>

      {/* 반짝이 / 구슬 */}
      <span className="absolute right-[18px] top-[24px] h-2.5 w-2.5 rounded-full bg-blue-400" />
      <span className="absolute left-1.5 top-[58px] h-1.5 w-1.5 rounded-full bg-blue-300" />
      <Sparkle className="right-[12px] top-[96px] text-white" />
      <Sparkle className="left-3 top-[30px] text-blue-300" small />
    </div>
  );
}

// 공통 티켓 — 가운데 점선 절취선 + 좌우 노치
function Ticket({
  className,
  notchClass,
  children,
}: {
  className?: string;
  notchClass: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl",
        className,
      )}
    >
      {/* 좌우 노치 */}
      <span
        className={cn(
          "absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full",
          notchClass,
        )}
      />
      <span
        className={cn(
          "absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full",
          notchClass,
        )}
      />
      {/* 절취 점선 */}
      <span className="absolute inset-y-2 right-[26px] border-l border-dashed border-white/45" />
      {children}
    </div>
  );
}

// ── 오브젝트: 오렌지 티켓 + 코인 + 선물상자 ──────────────────────
function RewardObject() {
  return (
    <div className="relative h-full w-full">
      {/* 선물상자 */}
      <div className="absolute right-3 top-[30px] h-[60px] w-[60px] rotate-[-4deg]">
        {/* 뚜껑 */}
        <div className="absolute -top-2 left-1/2 h-4 w-[68px] -translate-x-1/2 rounded-md bg-gradient-to-b from-orange-300 to-orange-400" />
        {/* 몸통 */}
        <div className="absolute top-1.5 h-[52px] w-full rounded-md bg-gradient-to-b from-amber-100 to-amber-200" />
        {/* 세로 리본 */}
        <div className="absolute top-1.5 left-1/2 h-[52px] w-3 -translate-x-1/2 bg-orange-400/90" />
        {/* 리본 매듭 */}
        <div className="absolute -top-2.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-sm bg-orange-400" />
      </div>

      {/* 적립 티켓 */}
      <Ticket
        className="absolute right-[36px] top-[78px] h-[52px] w-[100px] rotate-[6deg] bg-gradient-to-br from-orange-400 to-orange-500 shadow-md shadow-orange-500/20"
        notchClass="bg-amber-50"
      >
        <span className="text-[14px] font-extrabold text-white">3,000원</span>
        <span className="text-[10px] font-bold text-white/85">적립</span>
      </Ticket>

      {/* 포인트 코인 */}
      <Coin className="absolute left-2 top-[58px]" label="P" />
      <Coin className="absolute left-[18px] top-[78px]" label="P" />

      {/* 색종이 */}
      <span className="absolute right-2 top-[18px] h-2 w-2 rotate-12 rounded-[2px] bg-amber-400" />
      <span className="absolute right-[64px] top-[64px] h-2 w-2 -rotate-12 rounded-[2px] bg-orange-300" />
    </div>
  );
}

// ── 오브젝트: 장보기 바구니 + 식료품 + 50% 태그 ─────────────────
function GroceryObject() {
  return (
    <div className="relative h-full w-full">
      {/* 잎사귀 */}
      <span className="absolute right-7 top-2.5 h-2.5 w-4 -rotate-45 rounded-full bg-emerald-300" />
      <span className="absolute right-[88px] top-5 h-2 w-3 rotate-[30deg] rounded-full bg-emerald-300/80" />

      {/* 바구니 안 식료품 — 바구니보다 먼저 렌더해 바구니가 앞에 오고, 위로 빼꼼 보이게 */}
      <div className="absolute bottom-[44px] right-[26px] flex items-end gap-[3px]">
        {/* 양배추 */}
        <span className="h-8 w-8 rounded-full bg-gradient-to-b from-green-400 to-green-500" />
        {/* 토마토 */}
        <span className="mb-1 h-6 w-6 rounded-full bg-gradient-to-b from-red-400 to-red-500" />
        {/* 우유 */}
        <span className="h-10 w-[18px] rounded-[3px] bg-gradient-to-b from-white to-zinc-100" />
        {/* 바나나 */}
        <span className="mb-2 h-3.5 w-7 -rotate-[18deg] rounded-full bg-gradient-to-b from-yellow-300 to-yellow-400" />
      </div>
      {/* 계란 */}
      <span className="absolute bottom-[50px] right-[24px] h-3 w-2.5 rounded-full bg-amber-50" />

      {/* 바구니 */}
      <div className="absolute bottom-2.5 right-3 h-[44px] w-[116px]">
        {/* 테두리(림) */}
        <div className="absolute -top-1 h-3 w-full rounded-full bg-emerald-600" />
        {/* 몸통 — 살짝 사다리꼴 */}
        <div
          className="absolute top-1.5 h-[40px] w-full bg-gradient-to-b from-emerald-400 to-emerald-500"
          style={{
            clipPath: "polygon(6% 0, 94% 0, 86% 100%, 14% 100%)",
            borderBottomLeftRadius: "10px",
            borderBottomRightRadius: "10px",
          }}
        />
        {/* 살 무늬 */}
        <div className="absolute top-2 left-1/2 h-[32px] w-px -translate-x-1/2 bg-white/30" />
        <div className="absolute top-2 left-[34%] h-[32px] w-px bg-white/20" />
        <div className="absolute top-2 left-[66%] h-[32px] w-px bg-white/20" />
      </div>

      {/* 50% OFF 태그 — 바구니 앞에 겹치게 */}
      <div className="absolute bottom-[8px] right-[92px] flex h-9 w-9 rotate-[-6deg] flex-col items-center justify-center rounded-md bg-white shadow-sm">
        <span className="text-[10px] font-extrabold leading-none text-emerald-600">
          50%
        </span>
        <span className="text-[7px] font-bold leading-none text-emerald-500">
          OFF
        </span>
      </div>

      {/* 원화 코인 — 바구니 앞 */}
      <Coin className="absolute bottom-[6px] right-[74px]" label="₩" green />
    </div>
  );
}

// ── 공통 코인 ───────────────────────────────────────────────────
function Coin({
  className,
  label,
  green,
}: {
  className?: string;
  label: string;
  green?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-sm",
        green
          ? "bg-gradient-to-b from-emerald-400 to-emerald-500"
          : "bg-gradient-to-b from-yellow-300 to-amber-400 text-amber-800",
        className,
      )}
    >
      {label}
    </span>
  );
}

// ── 작은 반짝이(4각 별) ─────────────────────────────────────────
function Sparkle({ className, small }: { className?: string; small?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("absolute", small ? "h-2.5 w-2.5" : "h-3.5 w-3.5", className)}
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 0c.6 5.5 6 10.9 12 12-6 1.1-11.4 6.5-12 12-.6-5.5-6-10.9-12-12C6 10.9 11.4 5.5 12 0Z" />
    </svg>
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
