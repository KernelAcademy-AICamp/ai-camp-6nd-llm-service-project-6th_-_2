"use client";

// 로그인 화면 하단 PWA 설치 안내.
//   · Android/Chrome : beforeinstallprompt 캡처 → [설치] 버튼으로 네이티브 프롬프트 호출
//   · iOS/Safari     : 프롬프트 API 없음 → 수동 안내(주소창 공유 → 더보기 → 홈 화면에 추가)
//   이미 설치(standalone)거나 사용자가 닫으면 노출하지 않는다.

import { useEffect, useState } from "react";

type Mode = "none" | "android" | "ios";

// 최소한의 beforeinstallprompt 타입
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function ShareIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V4" />
      <path d="M8.5 7.5 12 4l3.5 3.5" />
      <path d="M6 11v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
function ChevronDownCircle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#E5E7EB" />
      <path d="m7.5 10 4.5 4.5 4.5-4.5" fill="none" stroke="#4B5563" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
// 사파리 '···' 메뉴 버튼 — 둥근 박스 + 점 3개
function MoreButtonIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#E5E7EB" />
      <circle cx="8" cy="12" r="1.3" fill="#4B5563" />
      <circle cx="12" cy="12" r="1.3" fill="#4B5563" />
      <circle cx="16" cy="12" r="1.3" fill="#4B5563" />
    </svg>
  );
}
// iOS '홈 화면에 추가' 아이콘 — 둥근 모서리 사각형 + 가운데 +
function AddToHomeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("none");
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  // iOS 브라우저별 동선이 다름: safari(하단····부터 4단계) / chrome(상단·공유부터 3단계) / firefox(하단·공유부터 3단계)
  const [iosBrowser, setIosBrowser] = useState<"safari" | "chrome" | "firefox">("safari");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return; // 이미 설치됨

    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    if (isIOS) {
      // FxiOS=파폭, CriOS=크롬, EdgiOS=엣지(크롬과 동일 동선), 그 외=사파리
      setIosBrowser(/fxios/i.test(ua) ? "firefox" : /crios|edgios/i.test(ua) ? "chrome" : "safari");
      setMode("ios");
      return;
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent); // 프롬프트 가능 → [설치] 버튼 활성
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    const onInstalled = () => setMode("none");
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setMode("none");
  }

  if (mode === "none") return null;

  const sz = "inline-block h-[18px] w-[18px]";
  const shareCls = "inline-block h-4 w-4 text-blue-500";
  // 브라우저별 실제 동선
  const iosSteps =
    iosBrowser === "safari"
      ? [
          <span key="s1" className="flex items-center gap-1.5">하단 주소창 <MoreButtonIcon className={sz} /> 누르기</span>,
          <span key="s2" className="flex items-center gap-1.5"><ShareIcon className={shareCls} /> ‘공유’ 누르기</span>,
          <span key="s3" className="flex items-center gap-1.5"><ChevronDownCircle className={sz} /> ‘더보기’ 누르기</span>,
          <span key="s4" className="flex items-center gap-1.5"><AddToHomeIcon className={sz} /> ‘홈 화면에 추가’ 선택</span>,
        ]
      : [
          <span key="c1" className="flex items-center gap-1.5">{iosBrowser === "firefox" ? "하단" : "상단"} 주소창 <ShareIcon className={shareCls} /> ‘공유’ 누르기</span>,
          <span key="c2" className="flex items-center gap-1.5"><ChevronDownCircle className={sz} /> ‘더보기’ 누르기</span>,
          <span key="c3" className="flex items-center gap-1.5"><AddToHomeIcon className={sz} /> ‘홈 화면에 추가’ 선택</span>,
        ];

  return (
    <div className="w-full rounded-2xl border border-brand/20 bg-brand-50/60 p-4">
      {mode === "android" ? (
        <div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="띵동" className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-zinc-900">홈 화면에 추가</p>
              <p className="text-[12px] text-zinc-500">앱처럼 빠르게, 알림도 받아요</p>
            </div>
            <button
              onClick={install}
              className="shrink-0 rounded-xl bg-brand px-4 py-2 text-[13.5px] font-bold text-white active:opacity-80"
            >
              설치
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="띵동" className="h-7 w-7 shrink-0 rounded-lg" />
            <p className="flex-1 text-[14px] font-bold text-zinc-900">홈 화면에 추가하고 앱처럼 쓰기</p>
          </div>
          <ol className="flex flex-col gap-1.5">
            {iosSteps.map((node, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-zinc-600">
                <Step n={i + 1} />
                {node}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-dark">
      {n}
    </span>
  );
}
