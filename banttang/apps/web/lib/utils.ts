import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// KST(UTC+9)로 표시. CLAUDE.md: 저장은 UTC, 표시는 KST.
// 수동 포맷 — Intl.DateTimeFormat은 Node.js(small-ICU) vs 브라우저에서
// "PM 05:46" / "오후 05:46" 처럼 다르게 출력해 hydration mismatch가 발생.
// 한국은 DST 없어 UTC+9 고정으로 안전하게 시프트할 수 있다.
function kstParts(iso: string) {
  const utc = new Date(iso).getTime();
  const k = new Date(utc + 9 * 60 * 60 * 1000);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
  };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatKstTime(iso: string): string {
  const { hour, minute } = kstParts(iso);
  const ampm = hour < 12 ? "오전" : "오후";
  const h12 = hour % 12 || 12;
  return `${ampm} ${pad2(h12)}:${pad2(minute)}`;
}

export function formatKstDateTime(iso: string): string {
  const { month, day, hour, minute } = kstParts(iso);
  const ampm = hour < 12 ? "오전" : "오후";
  const h12 = hour % 12 || 12;
  return `${pad2(month)}. ${pad2(day)}. ${ampm} ${pad2(h12)}:${pad2(minute)}`;
}

export function formatKrw(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

// 채팅 날짜 구분선 라벨: "오늘" / "어제" / "2026년 5월 19일 화요일"
export function formatKstDateLabel(iso: string): string {
  const d = new Date(iso);
  const todayKey = kstDateKey(new Date());
  const yesterdayKey = kstDateKey(new Date(Date.now() - 86400000));
  const key = kstDateKey(d);
  if (key === todayKey) return "오늘";
  if (key === yesterdayKey) return "어제";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(d);
}

function kstDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
