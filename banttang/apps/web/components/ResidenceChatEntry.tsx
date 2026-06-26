"use client";

// 채팅 목록(/chat) 상단에 끼우는 "우리 건물 채팅방" 항목 (목업).
// 입장(localStorage) 했을 때만 보인다. 백엔드 연동 시 실제 멤버십/마지막 메시지로 교체.
//
// noParties=true (참여 중 파티 0개)일 때:
//   - 입장한 건물방도 없으면 → 채팅 빈 상태 안내를 대신 렌더
//   - 입장한 건물방이 있으면 → 그 방만 보여줌

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  residenceJoinedKey,
  MOCK_LAST_MESSAGE,
  MOCK_LAST_TIME,
} from "@/lib/residence-room";

// 오피스텔/빌라/고시원 같은 단일 다층 주거건물 아이콘 (창문 4개 + 출입문).
function BuildingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5.5 21V5.2A1.2 1.2 0 0 1 6.7 4h10.6A1.2 1.2 0 0 1 18.5 5.2V21" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3.5 21h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 21v-3a2 2 0 0 1 4 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="7.8" y="7" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="13.6" y="7" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="7.8" y="11.6" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="13.6" y="11.6" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function ResidenceChatEntry({
  residence,
  noParties,
}: {
  residence: string | null;
  noParties: boolean;
}) {
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!residence) return;
    try {
      setJoined(localStorage.getItem(residenceJoinedKey(residence)) === "1");
    } catch {
      /* localStorage 불가 환경 무시 */
    }
  }, [residence]);

  if (residence && joined) {
    return (
      <Link
        href={"/chat/residence" as any}
        className="flex items-center gap-3 rounded-2xl border border-black/[0.04] bg-white px-4 py-3 transition-colors active:bg-zinc-50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#5B6CF0]">
          <BuildingIcon />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-bold text-zinc-900">{residence}</span>
            <span className="shrink-0 rounded-full bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#5B6CF0]">
              우리 건물
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-zinc-500">{MOCK_LAST_MESSAGE}</p>
        </div>
        <span className="shrink-0 self-start text-[11px] text-zinc-300">{MOCK_LAST_TIME}</span>
      </Link>
    );
  }

  if (noParties) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="mb-3 text-4xl" aria-hidden>
          💬
        </span>
        <h2 className="text-lg font-bold text-zinc-900">아직 참여 중인 채팅방이 없어요</h2>
        <p className="mt-2 text-sm text-zinc-500">
          홈에서 마음에 드는 반띵에 참여하거나
          <br />
          커뮤니티에서 우리 건물 채팅방에 입장해보세요.
        </p>
      </div>
    );
  }

  return null;
}
