"use client";

// 반띵 가이드 — Lovable "모아 파티 가이드" 디자인을 banttang 톤으로 포팅.
//   - shadcn 토큰 → 브랜드 그린(#7FB069)/zinc 매핑
//   - lucide → 인라인 SVG
//   - 에스크로/수수료/환불 문구 → 반띵 실제 모델(영수증 인증·수수료 없음·송금은 이웃끼리)로 각색
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuideShareButton } from "./guide-share-button";

type Mode = "same" | "split";

export function GuideScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("same");

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
        <span className="text-[15px] font-semibold">반띵 가이드</span>
        <span className="w-10" />
      </header>

      <main className="mx-auto w-full max-w-[480px] pb-32">
        {/* HERO */}
        <section className="px-6 pb-10 pt-12 text-center">
          <span className="inline-flex items-center rounded-full bg-zinc-900/85 px-4 py-1.5 text-[13px] font-semibold text-white">
            더 많은 반띵
          </span>
          <h1 className="mt-5 text-[26px] font-extrabold leading-[1.35] tracking-tight">
            혼자 사긴 부담됐던 것들
            <br />
            이제 동네 이웃과 반띵해요
          </h1>
          <div className="mt-8 flex justify-center">
            <img src="/guide/guide-map.png" alt="동네 곳곳에서 열리는 반띵" className="h-auto w-[320px]" />
          </div>
        </section>

        {/* 영수증 인증(안심) 카드 */}
        <section className="px-5">
          <div className="rounded-3xl bg-brand-50 px-6 py-8 text-center">
            <img src="/guide/guide-safe.png" alt="" loading="lazy" className="mx-auto h-40 w-40" />
            <h2 className="mt-2 text-[20px] font-extrabold tracking-tight">
              영수증 인증으로 안전하게 거래해요
            </h2>
            <ul className="mt-3 space-y-1 text-[14px] text-zinc-500">
              <li>· 영수증으로 실제 결제 금액을 확인해요</li>
              <li>· 거래 후 서로 평가가 신뢰점수에 쌓여요</li>
            </ul>
            <p className="mt-3 text-[12px] text-brand-dark">
              *반띵은 거래 수수료가 없어요 · 송금은 이웃끼리 직접
            </p>
          </div>
        </section>

        {/* 나누는 방법 */}
        <section className="mt-16 px-5">
          <h2 className="text-center text-[22px] font-extrabold">나누는 방법</h2>

          <div className="mt-6 grid grid-cols-2 border-b border-zinc-200">
            {(
              [
                { id: "same", label: "같은 상품 나누기" },
                { id: "split", label: "각자 담아 나누기" },
              ] as const
            ).map((t) => {
              const active = mode === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMode(t.id)}
                  className={`relative py-3 text-[15px] transition ${
                    active ? "font-bold text-zinc-900" : "text-zinc-400"
                  }`}
                >
                  {t.label}
                  <span
                    className={`absolute inset-x-4 -bottom-px h-[3px] rounded-full ${
                      active ? "bg-zinc-900" : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* 상단 2-카드 */}
          <h3 className="mt-10 text-center text-[20px] font-extrabold">
            {mode === "same" ? "한 상자를 나눠가져요" : "각자 원하는 메뉴를 담아요"}
          </h3>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <FeatureCard
              tag={mode === "same" ? "함께 사서" : "혼자서도"}
              title={mode === "same" ? "더 싸게 나눠요" : "최소주문 OK"}
              img="/guide/guide-house.png"
              alt="혜택"
              badge={
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-500">
                  <Lock /> 함께 더 싸게
                </span>
              }
            />
            <FeatureCard
              tag="픽업까지"
              title="동네에서 바로"
              img="/guide/guide-box.png"
              alt="픽업"
              badge={
                <span className="absolute right-3 top-3 inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                  동네
                </span>
              }
            />
          </div>

          {/* 단계 */}
          <div className="mt-12 space-y-10">
            <Step
              n={1}
              title="‘반띵 열기’ 버튼을 눌러주세요"
              caption={
                mode === "same"
                  ? "사고 싶은 상품과 인원수를 정해요."
                  : "주문할 가게와 모집 인원을 정해요."
              }
            >
              <MockPartyCard mode={mode} />
            </Step>

            <Step
              n={2}
              title="이웃이 모이면 함께 주문해요"
              caption="호스트가 대표로 주문하고 영수증을 올려요."
            >
              <MockPayCard />
            </Step>

            <Step
              n={3}
              title="받고 영수증으로 정산해요"
              caption="인증된 금액을 기준으로 이웃끼리 직접 송금해요."
            >
              <MockConfirmCard />
            </Step>
          </div>

          {/* 호스트 가이드 바로가기 */}
          <button
            type="button"
            className="mt-10 flex w-full items-center justify-between rounded-2xl bg-brand-50 px-5 py-4 text-left text-[15px] font-bold text-zinc-900 active:bg-brand-100"
          >
            호스트 가이드 바로가기
            <ChevronRight />
          </button>
        </section>

        {/* 공유 */}
        <section className="mt-10 bg-zinc-50 px-5 py-10 text-center">
          <p className="text-[15px] font-semibold">이 소식을 혼자만 알기 아쉽다면!</p>
          <div className="mt-4 flex justify-center">
            <GuideShareButton />
          </div>
        </section>

        {/* FAQ */}
        <section className="px-5 pt-2">
          <ul className="divide-y divide-zinc-100">
            {FAQ.map((q, i) => (
              <FaqRow key={i} q={q.q} a={q.a} />
            ))}
          </ul>
        </section>
      </main>

      {/* 플로팅 CTA — 하단 탭(BottomNav 56px) 위에 정렬 */}
      <div className="fixed inset-x-0 bottom-14 z-20 mx-auto max-w-md border-t border-zinc-100 bg-white/95 p-4 backdrop-blur">
        <Link
          href={"/" as never}
          className="flex h-12 items-center justify-center rounded-xl bg-brand text-[15px] font-bold text-white shadow-lg shadow-emerald-500/30"
        >
          지금 반띵 시작하기
        </Link>
      </div>
    </div>
  );
}

/* ------------------------- Sub-components ------------------------- */

function FeatureCard({
  tag,
  title,
  img,
  alt,
  badge,
}: {
  tag: string;
  title: string;
  img: string;
  alt: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-zinc-50 px-4 pb-3 pt-4">
      <p className="text-[12px] text-zinc-500">{tag}</p>
      <p className="mt-0.5 text-[16px] font-bold">{title}</p>
      <div className="mt-3 flex h-24 items-end justify-center">
        <img src={img} alt={alt} loading="lazy" className="h-24 w-auto object-contain" />
      </div>
      {badge && <div className="mt-3 flex">{badge}</div>}
    </div>
  );
}

function Step({
  n,
  title,
  caption,
  children,
}: {
  n: number;
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-[12px] font-bold text-zinc-500">
          {n}
        </span>
        <div>
          <p className="text-[16px] font-bold leading-snug">{title}</p>
          {caption && <p className="mt-1 text-[13px] text-zinc-500">{caption}</p>}
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl bg-zinc-50 p-5">{children}</div>
    </div>
  );
}

function MockPartyCard({ mode }: { mode: Mode }) {
  return (
    <div className="relative mx-auto w-full max-w-[280px] rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
      <p className="text-[18px] font-extrabold tracking-tight">
        {mode === "same" ? "12,000원" : "BBQ 황금올리브 외 3건"}
      </p>
      <p className="mt-1 text-[12px] text-zinc-500">
        {mode === "same" ? "코스트코 휴지 30롤 · 3분 전" : "치킨 · 방금 전"}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400"
          aria-label="찜하기"
        >
          <Heart />
        </button>
        <button
          type="button"
          className="flex h-10 flex-1 items-center justify-center rounded-lg bg-brand text-[14px] font-bold text-white"
        >
          반띵 참여하기
        </button>
      </div>
      <img src="/guide/guide-hand.png" alt="" loading="lazy" className="pointer-events-none absolute -bottom-3 right-4 h-16 w-16" />
    </div>
  );
}

function MockPayCard() {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
      <span className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
        내 몫
      </span>
      <p className="mt-3 text-[15px] font-bold">코스트코 휴지 10롤</p>
      <p className="mt-0.5 text-[13px] text-zinc-500">4,000원 · 이웃 3명 모집 중 (2/3)</p>
      <button
        type="button"
        className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-brand text-[14px] font-bold text-white"
      >
        반띵 참여하기
      </button>
    </div>
  );
}

function MockConfirmCard() {
  return (
    <div className="mx-auto flex w-full max-w-[260px] flex-col items-center">
      <img src="/guide/guide-box.png" alt="" loading="lazy" className="h-28 w-28" />
      <button
        type="button"
        className="relative mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand text-[14px] font-bold text-white"
      >
        수령 완료
        <img src="/guide/guide-hand.png" alt="" loading="lazy" className="pointer-events-none absolute -bottom-3 right-2 h-14 w-14" />
      </button>
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
    q: "반띵이 무엇인가요?",
    a: "동네 이웃과 함께 상품을 공동구매하거나 배달 음식을 나눠 시키는 서비스예요. 호스트가 반띵을 열고, 이웃이 참여해 함께 주문하면 끝!",
  },
  {
    q: "‘같은 상품 나누기’와 ‘각자 담아 나누기’는 어떻게 다른가요?",
    a: "같은 상품 나누기는 대용량 상품 하나를 여러 명이 똑같이 나눠 가지는 방식, 각자 담아 나누기는 한 주문서 안에 각자 원하는 메뉴를 담는 방식이에요.",
  },
  {
    q: "정산은 어떻게 하나요?",
    a: "호스트가 영수증을 등록하면 실제 금액이 인증돼요. 인증된 금액을 기준으로 이웃끼리 직접 송금해 정산해요.",
  },
  {
    q: "이웃이 모이지 않으면 어떻게 되나요?",
    a: "모집 마감 시간까지 인원이 모이지 않으면 반띵은 자동으로 취소돼요.",
  },
  {
    q: "수수료가 있나요?",
    a: "반띵은 거래 수수료가 없어요. 송금은 이웃끼리 직접 하고, 우리는 영수증으로 금액만 인증해드려요.",
  },
  {
    q: "문제가 생겼을 때는 어떻게 하나요?",
    a: "마이페이지 고객센터로 문의해 주세요. 다만 송금은 이웃끼리 직접 하는 방식이라, 약속·금액을 꼭 확인하고 거래해 주세요.",
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
function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
function Heart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
function Lock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
