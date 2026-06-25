"use client";

// 아보카도 봇 메시지 — 왼쪽 봇 말풍선/카드 (카카오톡 방장봇 느낌).
//   - onShowGuide 있음(입장 안내): 띵동 안내 + "거래 방법 보기" / "띵동이란?" 버튼(페이지 이동)
//   - onShowGuide 없음(일반 봇 메시지): 버튼 없이 말풍선만

export function AvocadoBotCard({
  content,
  onShowGuide,
  onShowDoorbell,
}: {
  content: string;
  onShowGuide?: () => void;
  onShowDoorbell?: () => void;
}) {
  return (
    <div className="my-2 flex items-start gap-2 px-1">
      {/* 봇 아바타 — 로컬 SVG는 next/image 최적화 대상이 아니라 plain img로 노출 */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EAF4E1]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/avocado-mascot.svg" alt="아보카도" width={22} height={22} />
      </div>

      <div className="min-w-0 w-[66%]">
        <p className="mb-1 text-[12px] font-bold text-brand-dark">아보카도</p>
        <div className="rounded-2xl rounded-tl-md border border-zinc-200 bg-white p-3.5 shadow-sm">
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-700">
            {content}
          </p>

          {(onShowGuide || onShowDoorbell) && (
            <div className="mt-3 flex flex-col gap-2">
              {onShowGuide && (
                <button
                  type="button"
                  onClick={onShowGuide}
                  className="w-full rounded-lg bg-brand py-2 text-center text-[12px] font-bold text-white active:scale-[0.98]"
                >
                  거래 방법 보기
                </button>
              )}
              {onShowDoorbell && (
                <button
                  type="button"
                  onClick={onShowDoorbell}
                  className="w-full rounded-lg bg-brand py-2 text-center text-[12px] font-bold text-white active:scale-[0.98]"
                >
                  띵동이란?
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
