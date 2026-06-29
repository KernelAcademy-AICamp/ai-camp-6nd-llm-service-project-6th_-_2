"use client";

// 띵동이란? 가이드 — Lovable "dingdong" 디자인을 banttang 톤으로 포팅.
//   - shadcn 토큰 → 브랜드 그린/zinc 매핑, lucide → 인라인 SVG
//   - "모아 파티" → 반띵 / 파티장·파티원 용어 사용
//   - 띵동 동작은 실제 구현에 맞춤(채팅방 도착 알림 메시지 · 푸시 단정 X · 취소/자동수령 문구 제거)
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DoorbellGuideScreen() {
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col bg-white text-zinc-900">
      {/* 상단 바 */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-100 bg-white/90 px-4 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full active:bg-zinc-100"
        >
          <ArrowLeft />
        </button>
        <span className="text-[15px] font-semibold">띵동이란?</span>
        <span className="w-10" />
      </header>

      <main className="mx-auto w-full max-w-[480px] pb-20">
        {/* HERO */}
        <section className="px-6 pb-10 pt-12 text-center">
          <span className="inline-flex items-center rounded-full bg-brand-50 px-4 py-1.5 text-[13px] font-semibold text-brand-dark">
            채팅방 한 번 터치
          </span>
          <h1 className="mt-5 text-[26px] font-extrabold leading-[1.35] tracking-tight">
            약속 장소에 도착했을 때
            <br />
            띵동 버튼 한 번이면 끝!
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
            전화·메시지 없이 상대에게
            <br />
            “도착했어요”를 알려요.
          </p>
          <div className="mt-8 flex justify-center">
            <img src="/guide/dingdong-character.png" alt="띵동 캐릭터" className="h-40 w-auto" />
          </div>
        </section>

        {/* 핵심 기능 카드 */}
        <section className="px-5">
          <div className="rounded-3xl bg-brand-50 px-6 py-8 text-center">
            <img
              src="/guide/dingdong-meeting.png"
              alt="약속 장소에서 만나는 이웃"
              loading="lazy"
              className="mx-auto h-auto w-[260px]"
            />
            <h2 className="mt-4 text-[20px] font-extrabold tracking-tight">
              아보카도님이 “띵동”했어요!
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-500">
              약속 장소에 도착하면 버튼 한 번으로
              <br />
              상대방에게 도착을 알려요.
            </p>
          </div>
        </section>

        {/* 3가지 장점 */}
        <section className="mt-12 px-5">
          <h2 className="text-center text-[22px] font-extrabold">띵동을 쓰면 좋은 점</h2>
          <div className="mt-6 grid grid-cols-1 gap-3">
            <BenefitCard
              icon={<PhoneOff />}
              title="전화·메시지 없이 빠르게"
              desc="통화가 불편한 상황에서도 한 번의 터치로 도착을 알릴 수 있어요."
            />
            <BenefitCard
              icon={<MapPin />}
              title="약속 장소에서 바로 확인"
              desc="상대가 도착했는지 채팅방에서 바로 알 수 있어 기다림이 줄어요."
            />
            <BenefitCard
              icon={<Shield />}
              title="연락처는 그대로 보호"
              desc="앱 안에서만 알림이 오고 가니 번호 노출 없이 안전하게 만나요."
            />
          </div>
        </section>

        {/* 사용 방법 */}
        <section className="mt-16 px-5">
          <h2 className="text-center text-[22px] font-extrabold">이렇게 사용해요</h2>
          <div className="mt-6 space-y-4">
            <StepCard
              n={1}
              title="채팅방 우측 하단의 띵동 버튼을 찾아요"
              desc="거래 대화방 우측 아래에 아보카도 캐릭터와 함께 있는 띵동 버튼이 있어요."
            >
              <MockChatBar />
            </StepCard>
            <StepCard
              n={2}
              title="도착하면 버튼을 한 번 눌러요"
              desc="약속 장소에 도착했을 때 누르면 채팅방에 도착 알림이 떠요."
            >
              <MockNotification />
            </StepCard>
            <StepCard
              n={3}
              title="만나서 반띵 카드를 서로 확인해요"
              desc="서로 도착 알림을 확인하고 만나면, 채팅방의 ‘반띵 카드’를 열어 주문 내용을 함께 확인해요."
            >
              <MockCard />
            </StepCard>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-16 px-5">
          <h2 className="text-center text-[22px] font-extrabold">자주 묻는 질문</h2>
          <ul className="mt-6 divide-y divide-zinc-100">
            {FAQ.map((q, i) => (
              <FaqRow key={i} q={q.q} a={q.a} />
            ))}
          </ul>
        </section>

        {/* 하단 안내 */}
        <section className="mt-10 bg-zinc-50 px-5 py-10 text-center">
          <p className="text-[15px] font-semibold">아직 반띵에 참여해 보지 않으셨나요?</p>
          <p className="mt-1 text-[14px] text-zinc-500">
            띵동은 거래 대화방에서 자동으로 사용할 수 있어요.
          </p>
          <Link
            href={"/guide" as never}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-[14px] font-bold text-white"
          >
            <MessageCircle /> 거래 방법 가이드 보기
          </Link>
        </section>
      </main>
    </div>
  );
}

/* ------------------------- Sub-components ------------------------- */

function BenefitCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-zinc-50 p-4">
      <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-dark shadow-sm">
        {icon}
      </div>
      <div>
        <p className="text-[16px] font-bold">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}

function StepCard({
  n,
  title,
  desc,
  children,
}: {
  n: number;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand text-[12px] font-bold text-white">
          {n}
        </span>
        <div>
          <p className="text-[16px] font-bold leading-snug">{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{desc}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MockChatBar() {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-center gap-2">
        <div className="h-9 flex-1 rounded-full bg-zinc-100" />
        <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-3 py-2 shadow-md ring-1 ring-zinc-200">
          <img src="/guide/dingdong-character.png" alt="" className="h-6 w-auto" />
          <span className="text-[14px] font-bold text-brand-dark">띵동</span>
        </span>
      </div>
    </div>
  );
}

function MockNotification() {
  return (
    <div className="mx-auto flex w-full max-w-[280px] flex-col items-center">
      <div className="w-full rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-dark">
            <Bell />
          </div>
          <div>
            <p className="text-[14px] font-bold">아보카도님이 “띵동” 했어요!</p>
            <p className="text-[12px] text-zinc-500">망원동 엽떡 · 파티장</p>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[12px] text-zinc-500">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
        방금 전 도착 알림 수신
      </div>
    </div>
  );
}

// 반띵 카드 — 만난 뒤 채팅방에서 주문 내용을 서로 확인하는 카드.
function MockCard() {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-center gap-1.5">
        <span className="text-[15px]" aria-hidden>
          🪪
        </span>
        <p className="text-[13px] font-bold text-zinc-900">반띵 카드</p>
        <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
          망원동 엽떡
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="h-2.5 w-3/4 rounded-full bg-zinc-100" />
        <div className="h-2.5 w-1/2 rounded-full bg-zinc-100" />
      </div>
    </div>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left text-[15px] font-semibold"
      >
        <span className="flex-1">{q}</span>
        <span className={`shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`}>
          <ChevronDown />
        </span>
      </button>
      {open && <p className="-mt-1 pb-5 text-[14px] leading-relaxed text-zinc-500">{a}</p>}
    </li>
  );
}

const FAQ = [
  {
    q: "띵동은 언제 쓰는 기능인가요?",
    a: "파티장·파티원이 약속한 장소에 도착했을 때, 전화나 메시지 대신 한 번의 버튼 터치로 상대에게 도착 알림을 보낼 때 사용해요.",
  },
  {
    q: "띵동을 누르면 상대방에게 어떻게 알려지나요?",
    a: "채팅방에 도착 알림 메시지가 떠요. 파티원이 보내면 파티장에게, 파티장이 보내면 파티원 전원에게 보여요. 번호나 개인 연락처는 공유되지 않아요.",
  },
  {
    q: "띵동 버튼이 안 보여요.",
    a: "띵동은 채팅방이 열린 거래(완료·취소 전)에서 우측 하단에 나타나요. 거래가 끝났거나 취소된 방에서는 보이지 않아요.",
  },
  {
    q: "방금 보냈는데 다시 누르면 어떻게 되나요?",
    a: "중복 전송을 막기 위해 보낸 직후엔 잠깐 잠겼다가, 잠시 후 다시 보낼 수 있어요.",
  },
  {
    q: "띵동은 무료인가요?",
    a: "네, 띵동은 반띵의 기본 기능으로 무료로 사용할 수 있어요.",
  },
];

/* ------------------------- Icons (inline) ------------------------- */

function ArrowLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PhoneOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10.7 5.1A11 11 0 0 1 13 5a8 8 0 0 1 6 6c0 .6-.1 1.4-.3 2.2M5.5 9A11 11 0 0 0 5 11a8 8 0 0 0 8 8c.7 0 1.5-.1 2.2-.3M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MapPin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function Shield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l7 3v5c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Bell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function MessageCircle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.4-3.5A7.9 7.9 0 0 1 4 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
