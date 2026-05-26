"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { formatKrw } from "@/lib/utils";
import type { PartyWithStats } from "@/lib/types/domain";

interface Props {
  party: PartyWithStats;
  pickupLocationName?: string | null;
  isHost?: boolean;
  // 호스트의 "주문 인증" 버튼 클릭 시 호출 (ReceiptSheet 오픈)
  onVerifyReceipt?: () => void;
}

// 채팅방 상단 파티 정보 카드 — 당근 스타일.
// chip 영역 클릭 시 /post 페이지로 이동(시간/장소 변경 후에도 최신 값 확인 가능).
// 호스트는 "주문 인증" 버튼이 별도로 노출됨.
export function PartyInfoCard({
  party,
  pickupLocationName,
  isHost = false,
  onVerifyReceipt,
}: Props) {
  const time = useTimeLabels(party.deal_at);
  const postHref = `/parties/${party.id}/post` as const;

  return (
    <section className="border-b border-black/[0.06] bg-white px-4 py-3">
      {/* 1열: 메뉴 + 1인당 가격 + 화살표 (전체 page로 이동) */}
      <Link
        href={{ pathname: postHref }}
        className="block transition-colors active:bg-gray-50"
      >
        <div className="flex items-baseline justify-between gap-3">
          {party.representative_menu ? (
            <p className="min-w-0 truncate text-[14px] text-gray-800">
              {party.representative_menu}
            </p>
          ) : (
            <span />
          )}
          <p className="flex shrink-0 items-baseline gap-1">
            <span className="text-[11px] text-gray-400">1인당</span>
            <span className="text-[16px] font-bold text-brand">
              {formatKrw(party.price_per_person)}
            </span>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              className="ml-0.5 text-gray-300"
              aria-hidden
            >
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </p>
        </div>
      </Link>

      {/* chip 행 — 시간/장소는 page로 이동, 주문 인증은 호스트 전용 액션 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Link href={{ pathname: postHref }}>
          <Chip icon={<ClockIcon />} primary={time.absolute} />
        </Link>
        {pickupLocationName && (
          <Link href={{ pathname: postHref }}>
            <Chip icon={<PinIcon />} primary={pickupLocationName} />
          </Link>
        )}
        {isHost && onVerifyReceipt && (
          <button
            type="button"
            onClick={onVerifyReceipt}
            className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1.5 text-[12px] font-bold text-white transition-opacity active:opacity-80"
          >
            <ReceiptIcon />
            주문 인증
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- chip ----------

function Chip({
  icon,
  primary,
  secondary,
}: {
  icon: ReactNode;
  primary: string;
  secondary?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-[12px] text-gray-800">
      <span className="text-gray-500">{icon}</span>
      <span className="font-semibold">{primary}</span>
      {secondary && <span className="font-medium text-gray-500">· {secondary}</span>}
    </span>
  );
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 11h6M9 14h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ---------- 시간 라벨 ----------

interface TimeLabels {
  absolute: string;
  relative: string;
}

function useTimeLabels(dealAt: string): TimeLabels {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  return formatTimeLabels(now, dealAt);
}

function formatTimeLabels(nowMs: number, dealAt: string): TimeLabels {
  const dealMs = new Date(dealAt).getTime();
  return {
    absolute: absoluteLabel(dealAt, nowMs),
    relative: relativeLabel(dealMs - nowMs),
  };
}

function absoluteLabel(iso: string, nowMs: number): string {
  const todayKey = kstDateKey(new Date(nowMs));
  const tomorrowKey = kstDateKey(new Date(nowMs + 86400000));
  const dealKey = kstDateKey(new Date(iso));
  const t = kstTime12(iso);
  if (dealKey === todayKey) return `오늘 ${t}`;
  if (dealKey === tomorrowKey) return `내일 ${t}`;
  const { month, day } = kstParts(iso);
  return `${month}월 ${day}일 ${t}`;
}

function relativeLabel(diffMs: number): string {
  const minutes = Math.round(diffMs / 60_000);
  if (minutes <= 0) return "지금";
  if (minutes < 60) return `${minutes}분 후`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 후`;
  const days = Math.floor(hours / 24);
  return `${days}일 후`;
}

function kstParts(iso: string) {
  const k = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
  };
}

function kstDateKey(d: Date): string {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${k.getUTCMonth() + 1}-${k.getUTCDate()}`;
}

function kstTime12(iso: string): string {
  const { hour, minute } = kstParts(iso);
  const ampm = hour < 12 ? "오전" : "오후";
  const h12 = hour % 12 || 12;
  return `${ampm} ${h12}:${minute.toString().padStart(2, "0")}`;
}
