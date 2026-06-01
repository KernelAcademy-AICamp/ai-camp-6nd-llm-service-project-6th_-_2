"use client";

// 광고 사이트 링크 배너 — 슬라이드로 자동 전환.
// 각 슬라이드는 네이버 쇼핑 검색으로 연결(실제 동작). 4초마다 전환, 점 인디케이터.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Ad = { label: string; sub: string; href: string; gradient: string };

const ADS: Ad[] = [
  {
    label: "코스트코",
    sub: "대용량을 반띵으로",
    href: "https://www.costco.co.kr/",
    gradient: "from-rose-400 to-orange-400",
  },
  {
    label: "이마트몰",
    sub: "트레이더스 창고형 쇼핑",
    href: "https://m-emart.ssg.com/page/dvstore_traders/package.ssg",
    gradient: "from-sky-400 to-indigo-400",
  },
  {
    label: "가성비마켓",
    sub: "1인 가구 알뜰템",
    href: "https://www.gasungbi.kr/",
    gradient: "from-emerald-400 to-teal-400",
  },
];

const INTERVAL_MS = 4000;

export function StoreAdCarousel() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % ADS.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const ad = ADS[idx];

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <a
        href={ad.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex h-24 flex-col justify-center bg-gradient-to-r px-5 text-white transition-all",
          ad.gradient,
        )}
      >
        <span className="text-[11px] font-medium opacity-90">광고 · 쇼핑</span>
        <span className="text-lg font-bold leading-tight">{ad.label}</span>
        <span className="text-xs opacity-90">{ad.sub}</span>
      </a>

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
