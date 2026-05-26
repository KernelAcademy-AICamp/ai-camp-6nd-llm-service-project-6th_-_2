"use client";

import { cn } from "@/lib/utils";

interface Props {
  tone?: "warning" | "info";
  icon?: "receipt" | "check";
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

// 채팅방 액션 배너 — 현재 단계에서 다음으로 필요한 액션을 안내.
// 예: 인증 대기 단계 호스트에게 영수증 등록 유도, 거래 확인 대기 단계 전원에게 평가 유도.
export function ActionBanner({
  tone = "warning",
  icon = "receipt",
  title,
  description,
  actionLabel,
  onAction,
}: Props) {
  return (
    <div
      className={cn(
        "border-t border-b px-4 py-3",
        tone === "warning" && "border-amber-200 bg-amber-50",
        tone === "info" && "border-sky-200 bg-sky-50",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            tone === "warning" && "bg-amber-200/70 text-amber-700",
            tone === "info" && "bg-sky-200/70 text-sky-700",
          )}
        >
          {icon === "receipt" ? <ReceiptIcon /> : <CheckIcon />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-gray-900">
            {title}
          </p>
          {description && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-gray-600">
              {description}
            </p>
          )}
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className={cn(
              "h-8 shrink-0 self-center rounded-full px-3 text-[12px] font-bold text-white transition-opacity active:opacity-80",
              tone === "warning" && "bg-amber-600",
              tone === "info" && "bg-sky-600",
            )}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 8h6M9 11h6M9 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l4 4 10-10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
