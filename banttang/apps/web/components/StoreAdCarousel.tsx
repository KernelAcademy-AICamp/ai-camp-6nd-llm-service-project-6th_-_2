"use client";

// 광고 사이트 링크 배너 — 가로 슬라이드 캐러셀.
// 각 슬라이드는 네이버 쇼핑 / 쇼핑몰로 연결(실제 동작).
// - 4초마다 자동 전환 (한 칸씩 밀려나는 슬라이드 애니메이션)
// - 스와이프/드래그 제스처로 직접 넘기기 (터치 + 마우스)
// - 점 인디케이터 클릭으로 점프
// - 드래그 중에는 자동 전환 멈춤, 손 떼면 재개

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// 배너 이미지는 public/banners/ 에 128x448 로 제작된 디자인(상호·문구 포함).
// → 그라디언트/텍스트 오버레이 없이 이미지 자체를 배너로 표시.
type Ad = { alt: string; href: string; image: string };

const ADS: Ad[] = [
  {
    alt: "코스트코",
    href: "https://www.costco.co.kr/",
    image: "/banners/costco_128x448.png",
  },
  {
    alt: "이마트몰",
    href: "https://m-emart.ssg.com/page/dvstore_traders/package.ssg",
    image: "/banners/emart_128x448.png",
  },
  {
    alt: "가성비마켓",
    href: "https://www.gasungbi.kr/",
    image: "/banners/gasungbi_128x448.png",
  },
  {
    alt: "남도마켓",
    href: "https://www.jnmall.kr/",
    image: "/banners/namdo_128x448.png",
  },
];

const INTERVAL_MS = 4000;
// 이 거리(px) 이상 끌면 슬라이드 전환 / 링크 클릭 취소(스와이프로 간주).
const SWIPE_THRESHOLD = 50;

export function StoreAdCarousel() {
  const [idx, setIdx] = useState(0);
  // 드래그 중 손가락을 따라가는 실시간 오프셋(px). 손 떼면 0.
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const movedRef = useRef(0); // 이번 제스처의 총 이동량(클릭/스와이프 구분용)
  const downRef = useRef(false); // 포인터 누름 상태
  // 이 거리(px) 넘게 움직여야 "드래그"로 보고 포인터 캡처 → 탭은 캡처 안 함(<a> 클릭 정상).
  const DRAG_START_PX = 8;

  // 자동 전환 — 드래그 중에는 멈춤.
  useEffect(() => {
    if (dragging) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % ADS.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [dragging]);

  function onPointerDown(e: React.PointerEvent) {
    // 캡처는 아직 하지 않는다 — 탭(클릭)이 <a>로 정상 전달되도록.
    downRef.current = true;
    startXRef.current = e.clientX;
    movedRef.current = 0;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!downRef.current) return;
    const delta = e.clientX - startXRef.current;
    movedRef.current = Math.max(movedRef.current, Math.abs(delta));

    // 일정 거리 넘게 움직이면 그때 드래그 시작 + 포인터 캡처(배너 밖으로 끌어도 유지).
    if (!dragging) {
      if (Math.abs(delta) < DRAG_START_PX) return;
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 캡처 미지원 환경 무시
      }
    }

    // 양 끝에서 더 끌리지 않도록 저항(0.35배).
    const atStart = idx === 0 && delta > 0;
    const atEnd = idx === ADS.length - 1 && delta < 0;
    setDragPx(atStart || atEnd ? delta * 0.35 : delta);
  }

  function endDrag() {
    downRef.current = false;
    if (!dragging) return; // 탭(드래그 아님) → 아무것도 안 함, <a> 클릭이 처리
    if (dragPx <= -SWIPE_THRESHOLD && idx < ADS.length - 1) {
      setIdx((i) => i + 1);
    } else if (dragPx >= SWIPE_THRESHOLD && idx > 0) {
      setIdx((i) => i - 1);
    }
    setDragPx(0);
    setDragging(false);
  }

  // 스와이프였으면(이동량이 임계 이상) 링크 이동 막기.
  function onLinkClick(e: React.MouseEvent) {
    if (movedRef.current > 10) e.preventDefault();
  }

  return (
    <div className="relative select-none overflow-hidden">
      {/* 가로 트랙 — idx만큼 100%씩 밀고, 드래그 중엔 손가락 따라 추가 이동. */}
      <div
        ref={trackRef}
        className={cn(
          "flex touch-pan-y",
          dragging ? "" : "transition-transform duration-300 ease-out",
        )}
        style={{
          transform: `translateX(calc(${-idx * 100}% + ${dragPx}px))`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {ADS.map((ad) => (
          <a
            key={ad.alt}
            href={ad.href}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={onLinkClick}
            className="block h-32 w-full shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ad.image}
              alt={ad.alt}
              draggable={false}
              className="h-full w-full object-cover"
            />
          </a>
        ))}
      </div>

      {/* 점 인디케이터 */}
      <div className="absolute bottom-2 right-3 flex gap-1.5">
        {ADS.map((_, i) => (
          <button
            key={i}
            aria-label={`${i + 1}번 광고`}
            onClick={() => setIdx(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50",
            )}
          />
        ))}
      </div>
    </div>
  );
}
