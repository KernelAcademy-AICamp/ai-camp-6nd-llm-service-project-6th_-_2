"use client";

// 채팅 상단 빠른 안내 칩 — 헤더와 함께 고정 노출(가로 스크롤).
//   거래 방법 안내 → 거래 방법 메시지 전송
//   영수증 인증   → (호스트) 영수증 등록 시트 / (참여자) 반띵 카드
//   반띵 카드 보기 → 반띵 카드(금액·정산) 열기

import { useRef, type ReactNode } from "react";

export function ChatQuickChips({
  onGuide,
  onReceipt,
  onSettlement,
  completeChip,
}: {
  onGuide: () => void;
  onReceipt: () => void;
  onSettlement: () => void;
  /** 거래 시각 도달 후에만 전달됨 — 맨 앞에 노출되는 동적 칩.
   *  후기 미작성이면 "거래 완료"(확인 후 작성), 작성 완료면 "후기 보기". */
  completeChip?: { label: string; onClick: () => void };
}) {
  const chips: { label: string; icon: ReactNode; onClick: () => void }[] = [
    ...(completeChip
      ? [{ label: completeChip.label, icon: <CheckIcon />, onClick: completeChip.onClick }]
      : []),
    { label: "영수증 인증", icon: <ReceiptIcon />, onClick: onReceipt },
    { label: "반띵 카드 보기", icon: <CardIcon />, onClick: onSettlement },
    { label: "거래 방법 안내", icon: <GuideIcon />, onClick: onGuide },
  ];

  // 데스크톱 마우스 드래그로 가로 스크롤. (터치는 네이티브 스크롤 그대로 사용)
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  }
  function endDrag() {
    drag.current.active = false;
  }
  // 드래그로 끌었을 땐 칩 클릭이 발생하지 않도록 막는다.
  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  }

  return (
    <div
      ref={scrollRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onClickCapture={onClickCapture}
      className="flex gap-2 overflow-x-auto border-t border-black/[0.04] bg-white px-3 py-2 select-none [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing"
    >
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

// 거래 완료 — 체크
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
