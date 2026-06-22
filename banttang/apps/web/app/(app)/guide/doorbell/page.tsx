// 띵동(도어벨) 사용법 — 유저가 버튼의 동작/상태/대상을 이해하도록 구성.

import { GuideBackButton } from "@/components/chat/guide-back-button";

// 우측 하단에 뜨는 실제 띵동 버튼 미리보기 (상태별)
function DingButton({ state }: { state: "disabled" | "active" | "sent" }) {
  if (state === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-md ring-1 ring-black/5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/ding-avocado.svg" alt="" width={22} height={22} />
        </span>
        <span className="text-[13px] font-extrabold text-brand-dark">띵동</span>
      </span>
    );
  }
  if (state === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-md ring-1 ring-black/5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/ding-avocado.svg" alt="" width={22} height={22} />
        </span>
        <span className="text-[13px] font-extrabold text-zinc-400">보냄 ✓</span>
      </span>
    );
  }
  // disabled
  return (
    <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 shadow-md ring-1 ring-black/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/ding-avocado.svg" alt="" width={28} height={28} className="opacity-70" />
      <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#F97316] ring-2 ring-white" />
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-7 px-1 text-[16px] font-extrabold tracking-tight text-zinc-900">
      {children}
    </h2>
  );
}

export default function DoorbellGuidePage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 pb-16">
      <div className="flex items-center gap-2 pt-1">
        <GuideBackButton />
        <h1 className="relative top-[2px] text-[22px] font-extrabold tracking-tight text-zinc-900">
          띵동 사용법
        </h1>
      </div>

      {/* 한 줄 요약 */}
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <span className="text-2xl" aria-hidden>🔔</span>
        <p className="text-[14px] leading-relaxed text-zinc-700">
          <b className="text-zinc-900">띵동</b>은 약속 장소에 도착했을 때
          <b className="text-zinc-900"> 버튼 한 번으로 상대에게 알리는 </b>
          도착 알림이에요. 전화·메시지 없이 빠르게 만나요.
        </p>
      </div>

      {/* 버튼 상태 */}
      <SectionTitle>버튼은 이렇게 바뀌어요</SectionTitle>
      <div className="mt-2 flex flex-col gap-2.5">
        <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex w-16 shrink-0 justify-center">
            <DingButton state="disabled" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-zinc-900">거래 1시간 전 · 비활성</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500">
              버튼이 회색으로 생겨요. 눌러도 아직 보낼 수 없고, “15분 전부터 가능” 안내만 떠요.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex w-16 shrink-0 justify-center">
            <DingButton state="active" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-zinc-900">거래 15분 전 · 활성</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500">
              <b className="text-brand-dark">띵동</b> 버튼이 켜져요. 도착하면 눌러서 알려요.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex w-16 shrink-0 justify-center">
            <DingButton state="sent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-zinc-900">보낸 직후 · 전송 완료</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-500">
              중복 전송을 막기 위해 잠깐 잠겼다가, 잠시 후 <b className="text-zinc-700">다시 보내기</b>가 가능해요.
            </p>
          </div>
        </div>
      </div>

      {/* 알림 대상 */}
      <SectionTitle>누구에게 전달되나요?</SectionTitle>
      <div className="mt-2 flex flex-col gap-2.5">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-[14px] font-bold text-zinc-900">🙋 참여자가 누르면</p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            <b className="text-zinc-700">호스트에게만</b> “○○님이 도착했어요” 알림이 가요.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-[14px] font-bold text-zinc-900">👑 호스트가 누르면</p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
            <b className="text-zinc-700">참여자 전원에게</b> “호스트가 도착했어요” 알림이 가요.
          </p>
        </div>
      </div>

      <p className="mt-7 text-center text-[13px] text-zinc-400">
        거래 시간 +1시간이 지나면 띵동 버튼은 자동으로 사라져요.
      </p>
    </div>
  );
}
