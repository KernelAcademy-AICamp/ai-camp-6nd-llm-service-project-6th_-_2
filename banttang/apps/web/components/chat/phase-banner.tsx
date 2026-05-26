"use client";

import { cn } from "@/lib/utils";
import {
  PHASE_LABEL,
  PHASE_STEPS,
  type ChatPhase,
} from "@/lib/types/phase";

interface Props {
  phase: ChatPhase;
}

// F203 — 4단계 진행 인디케이터.
// 종결 상태(completed/cancelled)는 별도 톤의 단일 배너로 표시.
export function PhaseBanner({ phase }: Props) {
  if (phase === "completed") {
    return (
      <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-2.5">
        <p className="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-emerald-700">
          <DotIcon />
          완료된 반띵이에요
        </p>
      </div>
    );
  }
  if (phase === "cancelled") {
    return (
      <div className="border-b border-rose-100 bg-rose-50/70 px-4 py-2.5">
        <p className="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-rose-700">
          <DotIcon />
          취소된 반띵이에요
        </p>
      </div>
    );
  }

  const currentIndex = PHASE_STEPS.indexOf(phase);

  return (
    <div className="border-b border-black/[0.06] bg-white px-4 pb-3 pt-2">
      <ol className="flex items-center">
        {PHASE_STEPS.map((step, i) => {
          const past = i < currentIndex;
          const active = i === currentIndex;
          const last = i === PHASE_STEPS.length - 1;
          return (
            <li
              key={step}
              className={cn("flex flex-1 items-center", last ? "flex-none" : "")}
            >
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                    past && "bg-brand text-white",
                    active && "bg-brand text-white ring-4 ring-brand/20",
                    !past && !active && "bg-gray-200 text-gray-400",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {past ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M5 12l4 4 10-10"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[10px]",
                    active && "font-bold text-gray-900",
                    past && "text-gray-500",
                    !past && !active && "text-gray-400",
                  )}
                >
                  {PHASE_LABEL[step]}
                </span>
              </div>
              {!last && (
                <span
                  className={cn(
                    "mx-1 mb-[18px] h-[2px] flex-1 rounded-full",
                    i < currentIndex ? "bg-brand" : "bg-gray-200",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DotIcon() {
  return (
    <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
  );
}
