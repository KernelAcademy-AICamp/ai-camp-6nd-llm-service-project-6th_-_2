// 자주하는 질문(FAQ) — 정적 아코디언. 네이티브 <details>라 JS 불필요.
// (UserBar 가 mypage 서브페이지에 ← 헤더 제공)
export const dynamic = "force-static";

type Faq = { q: string; a: string };

const FAQS: Faq[] = [
  {
    q: "띵동(반띵)이 뭐예요?",
    a: "같은 동네 1인 가구끼리 배달·장보기를 같이 시켜서 최소주문금액·배송비·벌크 단위를 나누는 위치 기반 공동구매 서비스예요. 혼자라 부담스럽던 주문을 이웃과 합리적으로 나눠요.",
  },
  {
    q: "거래는 어떻게 진행되나요?",
    a: "① 모집글을 만들거나 참여해요 → ② 정원이 차면 채팅방이 열려요 → ③ 채팅으로 메뉴·만날 장소·시간을 정해요 → ④ 함께 주문하고 안전 픽업 장소에서 받아요 → ⑤ 영수증으로 금액을 인증하고 정산해요.",
  },
  {
    q: "돈은 어떻게 주고받나요?",
    a: "플랫폼은 돈을 보관하지 않아요. 정산은 이웃끼리 카카오페이·계좌이체로 직접 송금하고, 띵동은 영수증으로 실제 결제 금액만 확인해 드려요. (에스크로는 추후 검토)",
  },
  {
    q: "영수증 인증은 왜 하나요?",
    a: "누가 얼마를 결제했는지 명확히 해서 분쟁을 줄이기 위해서예요. 영수증을 올리면 금액·상호·날짜를 자동으로 읽어 거래 내역에 기록해요. 카드번호 같은 민감 정보는 가려서 처리해요.",
  },
  {
    q: "내 위치 정보는 안전한가요?",
    a: "정확한 집 주소·좌표는 공개되지 않아요. 매칭과 지도에는 '모집 장소' 좌표만 노출되고, 동네 단위로만 이웃과 연결돼요.",
  },
  {
    q: "신뢰등급(🌱민들레·🌳나무·👑왕대왕)은 어떻게 올라가요?",
    a: "거래를 완료하고 상대에게 '좋아요' 후기를 받을수록 신뢰점수가 올라 등급이 높아져요. 노쇼하거나 '별로' 후기를 받으면 점수가 내려가니, 약속을 지키는 게 가장 좋은 방법이에요.",
  },
  {
    q: "약속 시간에 못 나가게 됐어요(노쇼).",
    a: "되도록 빨리 채팅방에 알려 주세요. 미리 양해를 구하면 괜찮지만, 연락 없이 안 나오면 노쇼로 기록돼 신뢰점수가 내려갈 수 있어요.",
  },
  {
    q: "안전하게 만나려면 어떻게 하나요?",
    a: "모집글을 만들 때 띵동이 추천하는 '안전 픽업 장소'(편의점 앞, 역 출구 등 사람 많은 곳)를 골라 거래하세요. 낯선 곳·집 안에서의 거래는 피하는 걸 권해요.",
  },
];

export default function FaqPage() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="px-1 text-[16px] font-bold text-zinc-900">자주하는 질문</h1>

      <ul className="flex flex-col gap-2">
        {FAQS.map((f, i) => (
          <li key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5">
                <span className="shrink-0 text-[14px] font-bold text-brand">Q</span>
                <span className="flex-1 text-[14px] font-semibold text-zinc-900">
                  {f.q}
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
                  aria-hidden
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              <p className="whitespace-pre-line border-t border-zinc-100 px-4 py-3.5 text-[13px] leading-relaxed text-zinc-600">
                {f.a}
              </p>
            </details>
          </li>
        ))}
      </ul>

      <p className="px-1 pt-1 text-[12px] text-zinc-400">
        더 궁금한 점은 공지사항을 확인하거나 고객센터로 문의해 주세요.
      </p>
    </div>
  );
}
