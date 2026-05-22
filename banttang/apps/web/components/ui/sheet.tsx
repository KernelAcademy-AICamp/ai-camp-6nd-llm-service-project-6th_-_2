"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  // 화면 높이의 몇 %까지 차지할지. 기본 90%.
  maxHeightPct?: number;
}

// 모바일 우선 바텀 시트. ESC + 백드롭 클릭으로 닫힘.
// 채팅방 위에 띄워 영수증 등록 / 거래 완료 평가에 사용한다.
export function Sheet({
  open,
  onClose,
  title,
  children,
  maxHeightPct = 90,
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // 배경 스크롤 잠금
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: `${maxHeightPct}vh` }}
        className={cn(
          "flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl",
          "sm:rounded-2xl",
        )}
      >
        <header className="flex items-center justify-between border-b border-black/[0.06] bg-white px-4 py-3.5">
          <p className="text-[15px] font-bold text-gray-900">{title ?? ""}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors active:bg-black/[0.05]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto bg-white">{children}</div>
      </div>
    </div>
  );
}
