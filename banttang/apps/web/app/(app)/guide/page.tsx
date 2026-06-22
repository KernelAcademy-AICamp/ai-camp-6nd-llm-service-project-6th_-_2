// 거래 방법 안내 — 채팅 '거래 방법 보기'에서 진입하는 정적 가이드 페이지.
// (UserBar가 mypage 외 서브페이지에도 ← 헤더를 제공)

import { GuideBackButton } from "@/components/chat/guide-back-button";

const STEPS: { step: string; title: string; desc: string }[] = [
  {
    step: "1단계",
    title: "거래방 참여",
    desc: "관심 있는 반띵에 참여하거나 직접 만들어, 같은 동네 이웃과 채팅을 시작해요.",
  },
  {
    step: "2단계",
    title: "메뉴·장소·시간 정하기",
    desc: "채팅으로 무엇을 함께 살지, 어디서·언제 만날지 정해요.",
  },
  {
    step: "3단계",
    title: "함께 주문하고 받기",
    desc: "호스트가 주문하고, 안전한 픽업 장소에서 함께 받아 나눠요.",
  },
  {
    step: "4단계",
    title: "영수증 인증 & 정산",
    desc: "영수증으로 실제 금액을 인증하고, 이웃끼리 직접 정산(송금)해요.",
  },
  {
    step: "5단계",
    title: "거래 완료 & 후기",
    desc: "거래가 끝나면 서로 평가하고, 그 기록이 신뢰점수에 반영돼요.",
  },
];

const TIPS: { title: string; desc: string }[] = [
  { title: "동네 인증 확인", desc: "같은 동네로 인증된 이웃과 거래하면 더 안전해요." },
  { title: "안전 픽업 장소", desc: "사람이 많은 공개 장소(추천 픽업 장소)에서 받아요." },
  { title: "약속 다시 확인", desc: "만나기 전 시간·장소를 한 번 더 확인하고, 도착하면 '띵동'으로 알려요." },
  { title: "영수증 보관", desc: "정산 분쟁에 대비해 영수증을 등록·보관해요." },
];

const CAUTIONS: { title: string; desc: string }[] = [
  { title: "사기 방지", desc: "선입금 요청, 과도한 금액 요구 등 의심스러운 신호엔 거래를 중단하세요." },
  { title: "개인정보 보호", desc: "주민등록번호·계좌번호 등 민감 정보는 공유하지 말고 채팅으로만 진행해요." },
  { title: "분쟁 발생 시", desc: "이웃과 협의가 안 되면 운영자(고객센터)에 신고해 도움을 받을 수 있어요." },
];

const SETTLE: { title: string; desc: string }[] = [
  { title: "정산 방식", desc: "띵동은 거래 수수료가 없어요. 송금은 이웃끼리 직접 하고, 금액만 영수증으로 인증해요." },
  { title: "취소/환불", desc: "취소·환불은 참여자 간 협의에 따라요. 분쟁이 생기면 고객센터에 문의하세요." },
];

function Card({ title, desc, badge }: { title: string; desc: string; badge?: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3.5">
      <div className="flex items-center gap-2">
        {badge && (
          <span className="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-[12px] font-bold text-brand-dark">
            {badge}
          </span>
        )}
        <p className="text-[15px] font-bold text-zinc-900">{title}</p>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{desc}</p>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[17px] font-extrabold tracking-tight text-zinc-900">
          {title}
        </h2>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="text-zinc-400 transition-transform group-open:rotate-180"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-4">{children}</div>
    </details>
  );
}

export default function TradeGuidePage() {
  return (
    <div className="flex flex-1 flex-col gap-3 bg-zinc-50 p-4 pb-24">
      <div className="flex items-center gap-2 pt-1">
        <GuideBackButton />
        <h1 className="relative top-[2px] text-[22px] font-extrabold tracking-tight text-zinc-900">
          거래 방법 안내
        </h1>
      </div>

      <Section title="거래 단계" defaultOpen>
        {STEPS.map((s) => (
          <Card key={s.step} badge={s.step} title={s.title} desc={s.desc} />
        ))}
      </Section>

      <Section title="안전거래 팁">
        {TIPS.map((t) => (
          <Card key={t.title} title={t.title} desc={t.desc} />
        ))}
      </Section>

      <Section title="주의사항">
        {CAUTIONS.map((c) => (
          <Card key={c.title} title={c.title} desc={c.desc} />
        ))}
      </Section>

      <Section title="거래방 정산">
        {SETTLE.map((s) => (
          <Card key={s.title} title={s.title} desc={s.desc} />
        ))}
      </Section>
    </div>
  );
}
