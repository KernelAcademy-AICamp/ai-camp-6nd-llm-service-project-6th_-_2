"use client";

// 띵동(도어벨) 플로팅 CTA — 우측 하단 아보카도+벨 아이콘.
// 노출/상태 정책:
//   - 거래 1시간 전 이전 / 거래 완료 / 거래시간 +1시간 후: 미노출(부모에서 제어)
//   - 거래 1시간 전 ~ 15분 전: 비활성(흐린 회색). 탭 → 툴팁 "15분 전부터 띵동할 수 있어요."
//   - 거래 15분 전 ~ +1시간: 활성. 탭 → 띵동 전송. 전송 직후 쿨다운(보냄) → 이후 다시 보내기.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function DoorbellCta({
  enabled,
  sent,
  cooldown,
  isHost,
  onRing,
}: {
  enabled: boolean;
  sent: boolean;
  cooldown: number;
  isHost: boolean;
  onRing: () => void;
}) {
  const [tip, setTip] = useState<string | null>(null);
  useEffect(() => {
    if (!tip) return;
    const id = setTimeout(() => setTip(null), 2500);
    return () => clearTimeout(id);
  }, [tip]);

  const onCooldown = sent && cooldown > 0;
  const active = enabled && !onCooldown; // 클릭 시 실제 전송 가능한 상태

  function handleClick() {
    if (!enabled) {
      setTip("거래 15분 전부터 띵동할 수 있어요.");
      return;
    }
    if (onCooldown) {
      setTip(`방금 띵동을 보냈어요 · ${cooldown}초 후 다시 보낼 수 있어요`);
      return;
    }
    onRing();
    setTip(isHost ? "모두에게 띵동을 보냈어요 🔔" : "호스트에게 띵동을 보냈어요 🔔");
  }

  const Tooltip = tip ? (
    <div className="absolute bottom-[8.5rem] right-3 z-30 max-w-[72%] rounded-lg bg-black/80 px-3 py-2 text-[12px] font-medium text-white shadow-lg">
      {tip}
    </div>
  ) : null;

  // ── 띵동 가능 전: 작은 아보카도 벨 아이콘만 (흐린 회색) ──
  if (!enabled) {
    return (
      <>
        {Tooltip}
        <button
          type="button"
          onClick={handleClick}
          aria-label="띵동"
          className="absolute bottom-24 right-3 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 shadow-lg ring-1 ring-black/5 transition-transform active:scale-95"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/ding-avocado.svg" alt="" width={34} height={34} className="opacity-70" />
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#F97316] ring-2 ring-white" />
        </button>
      </>
    );
  }

  // ── 띵동 가능 시간: [아보카도 벨] + 라벨 알약 버튼 ──
  const label = onCooldown ? `보냄 · ${cooldown}s` : !sent ? "띵동" : "다시 보내기";
  return (
    <>
      {Tooltip}
      <button
        type="button"
        onClick={handleClick}
        aria-label="띵동"
        className={cn(
          "absolute bottom-24 right-3 z-20 flex items-center gap-1.5 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-lg ring-1 ring-black/5 transition-transform active:scale-95",
          onCooldown && "opacity-80",
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/ding-avocado.svg" alt="" width={26} height={26} />
        </span>
        <span
          className={cn(
            "text-[14px] font-extrabold",
            onCooldown ? "text-zinc-400" : "text-brand-dark",
          )}
        >
          {label}
        </span>
      </button>
    </>
  );
}
