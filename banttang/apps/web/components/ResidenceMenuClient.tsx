"use client";

// 거주지 채팅방 메뉴 페이지 (카카오톡 채팅방 메뉴 형태).
// 대화상대 리스트 + 신고하기 + 채팅방 나가기.
// 나가기: 목업 입장 상태(localStorage) 해제 → 채팅 목록으로.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { residenceJoinedKey, RESIDENCE_OTHER_MEMBERS } from "@/lib/residence-room";
import { CommunityAvatar } from "./CommunityAvatar";

export function ResidenceMenuClient({
  residence,
  memberCount,
  myNickname,
}: {
  residence: string;
  memberCount: number;
  myNickname: string;
}) {
  const router = useRouter();
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  function leaveRoom() {
    try {
      localStorage.removeItem(residenceJoinedKey(residence));
    } catch {
      /* 무시 */
    }
    router.push("/chat" as never);
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      {/* 헤더 */}
      <header className="flex items-center bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>

      {/* 방 타이틀 (중앙) */}
      <div className="flex flex-col items-center bg-white px-6 pb-7 pt-2">
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-[#EEF2FF] text-[#5B6CF0]">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 20V6.5a1 1 0 0 1 .7-.95l6-2A1 1 0 0 1 12 4.5V20M12 9.5l6.4 1.7a1 1 0 0 1 .6.95V20" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M3 20h18M7 9h1.5M7 12.5h1.5M7 16h1.5M15 14h1.5M15 17h1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <p className="mt-3 text-[18px] font-bold text-zinc-900">{residence}</p>
        <p className="mt-0.5 text-[13px] text-zinc-400">멤버 {memberCount}명</p>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {/* 대화상대 */}
        <section className="rounded-2xl bg-white p-1.5">
          <p className="px-3 pb-1 pt-2.5 text-[13px] font-bold text-zinc-500">대화상대</p>
          <ul>
            <li className="flex items-center gap-3 px-3 py-2.5">
              <CommunityAvatar name={myNickname} size={40} />
              <span className="text-[15px] font-semibold text-zinc-900">
                {myNickname} <span className="text-[12px] font-medium text-brand-dark">(나)</span>
              </span>
            </li>
            {RESIDENCE_OTHER_MEMBERS.map((name) => (
              <li key={name} className="flex items-center gap-3 px-3 py-2.5">
                <CommunityAvatar name={name} size={40} />
                <span className="text-[15px] text-zinc-800">{name}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 신고하기 / 채팅방 나가기 */}
        <section className="overflow-hidden rounded-2xl bg-white">
          <button
            type="button"
            onClick={() => setToast("신고 기능은 준비 중이에요")}
            className="flex w-full items-center px-4 py-3.5 text-left text-[15px] font-medium text-zinc-800 active:bg-zinc-50"
          >
            신고하기
          </button>
          <div className="mx-4 border-t border-zinc-100" />
          <button
            type="button"
            onClick={() => setConfirmLeaveOpen(true)}
            className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-[15px] font-bold text-rose-500 active:bg-rose-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 12H4m0 0 4-4m-4 4 4 4M11 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            채팅방 나가기
          </button>
        </section>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-md justify-center px-6">
          <span className="rounded-full bg-black/80 px-4 py-2 text-[13px] font-medium text-white shadow-lg">
            {toast}
          </span>
        </div>
      )}

      {/* 나가기 확인 */}
      {confirmLeaveOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-10"
          onClick={() => setConfirmLeaveOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-[300px] rounded-2xl bg-white p-5 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[16px] font-bold text-zinc-900">채팅방 나가기</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-500">
              {residence} 채팅방에서 나갈까요?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmLeaveOpen(false)}
                className="flex-1 rounded-xl bg-zinc-100 py-3 text-[15px] font-bold text-zinc-600 active:bg-zinc-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={leaveRoom}
                className="flex-1 rounded-xl bg-rose-500 py-3 text-[15px] font-bold text-white active:scale-[0.98]"
              >
                나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
