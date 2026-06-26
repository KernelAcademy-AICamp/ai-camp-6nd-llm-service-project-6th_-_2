"use client";

// 거주지(건물) 채팅방 — UI 시연용 목업.
// 백엔드 연동 전이라 메시지는 로컬 상태로만 동작(새로고침 시 초기화).
// 입력창은 실제 채팅과 동일하게 ChatInputBar 재사용.
// 햄버거 → /chat/residence/menu (대화상대/나가기) 별도 페이지로 이동.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MOCK_LAST_MESSAGE, MOCK_LAST_TIME } from "@/lib/residence-room";
import { CommunityAvatar } from "./CommunityAvatar";
import { ChatInputBar } from "./chat/chat-input-bar";

type Msg = {
  id: string;
  nickname: string;
  text: string;
  time: string; // "오후 2:31" 형태
  mine?: boolean;
};

// 시연용 시드 메시지 — 건물 이웃 잡담 톤.
const SEED: Msg[] = [
  { id: "s1", nickname: "초록세탁기", text: "엘리베이터 점검 오늘까지인가요? 아침에 한참 기다렸네요 😅", time: "오전 9:14" },
  { id: "s2", nickname: "햇살가득", text: "분리수거 요일 이번 주부터 화·금으로 바뀐 거 다들 아시죠?", time: "오전 11:02" },
  { id: "s3", nickname: "야근요정", text: MOCK_LAST_MESSAGE, time: MOCK_LAST_TIME },
];

function nowLabel(): string {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${m}`;
}

export function ResidenceChatClient({
  residence,
  memberCount,
  myNickname,
}: {
  residence: string;
  memberCount: number;
  myNickname: string;
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(SEED);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  function appendMine(text: string) {
    setMsgs((prev) => [
      ...prev,
      { id: `m${prev.length}`, nickname: myNickname, text, time: nowLabel(), mine: true },
    ]);
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      {/* 헤더 */}
      <header className="flex items-center gap-2 border-b border-zinc-100 bg-white px-3 py-2.5">
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
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#5B6CF0]">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5.5 21V5.2A1.2 1.2 0 0 1 6.7 4h10.6A1.2 1.2 0 0 1 18.5 5.2V21" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M3.5 21h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M10 21v-3a2 2 0 0 1 4 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <rect x="7.8" y="7" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
            <rect x="13.6" y="7" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
            <rect x="7.8" y="11.6" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
            <rect x="13.6" y="11.6" width="2.6" height="2.6" rx="0.4" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-zinc-900">{residence}</p>
          <p className="text-[12px] text-zinc-400">멤버 {memberCount}명</p>
        </div>
        {/* 햄버거 → 메뉴 페이지로 이동 */}
        <button
          type="button"
          onClick={() => router.push("/chat/residence/menu" as never)}
          aria-label="메뉴"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* 메시지 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
        {msgs.map((m) =>
          m.mine ? (
            <div key={m.id} className="flex items-end justify-end gap-1.5">
              <span className="mb-0.5 text-[10px] text-zinc-400">{m.time}</span>
              <p className="max-w-[74%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-[14px] leading-relaxed text-white">
                {m.text}
              </p>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-2">
              <CommunityAvatar name={m.nickname} size={34} />
              <div className="min-w-0">
                <p className="mb-1 text-[12px] font-semibold text-zinc-500">{m.nickname}</p>
                <div className="flex items-end gap-1.5">
                  <p className="max-w-[74%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-white px-3.5 py-2 text-[14px] leading-relaxed text-zinc-800 ring-1 ring-black/[0.04]">
                    {m.text}
                  </p>
                  <span className="mb-0.5 text-[10px] text-zinc-400">{m.time}</span>
                </div>
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {/* 입력창 — 실제 채팅과 동일한 ChatInputBar 재사용 */}
      <ChatInputBar
        onSend={(body) => appendMine(body)}
        onAttachImage={() => appendMine("사진을 보냈어요 📷")}
      />
    </div>
  );
}
