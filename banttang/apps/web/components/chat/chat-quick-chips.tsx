"use client";

// 채팅 상단 빠른 안내 칩 — 헤더와 함께 고정 노출(가로 스크롤).
//   거래 방법 안내 → 거래 방법 메시지 전송
//   영수증 인증   → (호스트) 영수증 등록 시트 / (참여자) 반띵 카드
//   반띵 카드 보기 → 반띵 카드(금액·정산) 열기

import type { ReactNode } from "react";

export function ChatQuickChips({
  onGuide,
  onReceipt,
  onSettlement,
}: {
  onGuide: () => void;
  onReceipt: () => void;
  onSettlement: () => void;
}) {
  const chips: { label: string; icon: ReactNode; onClick: () => void }[] = [
    { label: "영수증 인증", icon: <ReceiptIcon />, onClick: onReceipt },
    { label: "반띵 카드 보기", icon: <CardIcon />, onClick: onSettlement },
    { label: "거래 방법 안내", icon: <GuideIcon />, onClick: onGuide },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto border-t border-black/[0.04] bg-white px-3 py-2 [&::-webkit-scrollbar]:hidden">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.onClick}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-zinc-700 transition active:bg-zinc-50"
        >
          <span className="text-zinc-500">{c.icon}</span>
          {c.label}
        </button>
      ))}
    </div>
  );
}

// 거래 방법 — 펼친 책
function GuideIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 6.5C10.5 5 8.5 4.5 4.5 4.8v12.7c4-.3 6 .2 7.5 1.7 1.5-1.5 3.5-2 7.5-1.7V4.8c-4-.3-6 .2-7.5 1.7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 6.5V19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// 영수증
function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 8h6M9 11.5h6M9 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// 반띵 카드 — 신분증형 카드
function CardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5.5" width="18" height="13" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.5" cy="11" r="1.9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13.5 10h4M13.5 13.5h4M5.6 15.6c.5-1.1 1.6-1.7 2.9-1.7s2.4.6 2.9 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
