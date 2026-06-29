"use client";

// 띵동(도어벨) 플로팅 CTA — 우측 하단 아보카도+벨 알약 버튼.
// 정책: 채팅방 입장 시점부터 항상 노출. 시간 제한/쿨다운 없음.
//   탭 → "지금 사용하실 건가요?" 확인 팝업 → 전송. 전송 후 짧은 토스트.

import { useEffect, useState } from "react";

export function DoorbellCta({
  isHost,
  roomId,
  onRing,
}: {
  isHost: boolean;
  roomId: string;
  onRing: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // 안내 팝업은 기본적으로 벨을 누를 때마다 뜬다.
  // "다시 보지 않기"를 체크하면 이 방에서 더는 안 뜨고 바로 전송한다.
  const [introSeen, setIntroSeen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const seenKey = `doorbell-intro-seen:${roomId}`;

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    try {
      setIntroSeen(localStorage.getItem(seenKey) === "1");
    } catch {
      /* localStorage 불가 환경 무시 */
    }
  }, [seenKey]);

  function ring() {
    onRing();
    setToast("띵동을 보냈어요 🔔");
  }

  // "다시 보지 않기" 체크 상태를 localStorage에 반영.
  function persistDontShow() {
    if (!dontShowAgain) return;
    try {
      localStorage.setItem(seenKey, "1");
    } catch {
      /* 무시 */
    }
    setIntroSeen(true);
  }

  // 벨 탭: "다시 보지 않기"를 켠 적이 없으면 안내 팝업, 켰으면 바로 전송.
  function handleBellTap() {
    if (introSeen) {
      ring();
      return;
    }
    setDontShowAgain(false);
    setConfirmOpen(true);
  }

  function handleConfirm() {
    persistDontShow();
    setConfirmOpen(false);
    ring();
  }

  function handleCancel() {
    persistDontShow();
    setConfirmOpen(false);
  }

  return (
    <Frame>
      {toast && (
        <div className="pointer-events-none absolute bottom-[13.5rem] right-3 z-30 max-w-[72%] rounded-lg bg-black/80 px-3 py-2 text-[12px] font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* 알약 버튼: [아보카도 벨] 띵동 */}
      <button
        type="button"
        onClick={handleBellTap}
        aria-label="띵동"
        className="pointer-events-auto absolute bottom-44 right-3 z-20 flex items-center gap-1.5 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-lg ring-1 ring-black/5 transition-transform active:scale-95"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guide/dingdong-character.png" alt="" width={38} height={38} />
        </span>
        <span className="text-[14px] font-extrabold text-brand-dark">띵동</span>
      </button>

      {/* 확인 팝업 */}
      {confirmOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-10"
          onClick={handleCancel}
        >
          <div
            className="w-full max-w-[280px] rounded-2xl bg-white p-5 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/guide/dingdong-character.png" alt="" width={56} height={56} />
            </span>
            <p className="mt-3 text-[16px] font-extrabold text-zinc-900">
              띵동 할까요?
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
              약속 장소에 도착했다면
              <br />
              {isHost ? "참여자 모두에게" : "상대방에게"} 도착 알림을 보낼 수 있어요.
            </p>

            <label className="mt-4 flex cursor-pointer items-center justify-center gap-1.5 text-[12px] text-zinc-400 select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-3.5 w-3.5 accent-brand"
              />
              다시 보지 않기
            </label>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-xl bg-brand py-2.5 text-[14px] font-bold text-white active:opacity-80"
              >
                띵동 보내기
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-[14px] font-bold text-zinc-600 active:opacity-80"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </Frame>
  );
}

// 뷰포트에 고정되면서도 모바일 프레임(max-w-md)에 맞춰 정렬되는 오버레이.
// fixed라 페이지 스크롤과 무관하게 항상 우측 하단에 따라온다.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 mx-auto max-w-md">
      {children}
    </div>
  );
}
