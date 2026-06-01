"use client";

// 플로팅 아보카도 입장 안내.
//
// 동작:
//   - 첫 입장(version > seenVersion): info → 말풍선 자동, required → 바텀시트 자동
//   - info 말풍선: 8초 후 자동 닫힘. 닫기 후 FAB만 상주.
//   - 미확인 상태: FAB에 ! 배지.
//   - FAB 탭: 패널 다시 펼침. required면 ack 전까진 바텀시트.
//   - 정책 변경(version 증가): 다시 자동 노출 + 배지.
//
// 위치: 부모 컨테이너 `relative` 기준 absolute 우하단. 채팅 컨테이너에
// position: relative를 지정해 두면 input bar 위 + 메시지를 가리지 않음.
//
// 상태 저장: localStorage. DB 변경 없이 사용자별로 분리.
//   key 권장: `avocado-notice:${partyId}:${userId}`

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { EntryNotice } from "@/lib/types/avocado-notice";

interface StorageState {
  seenVersion: number;
  ackedVersion: number;
}

function readState(key: string): StorageState {
  if (typeof window === "undefined") return { seenVersion: 0, ackedVersion: 0 };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { seenVersion: 0, ackedVersion: 0 };
    const parsed = JSON.parse(raw) as Partial<StorageState>;
    return {
      seenVersion: parsed.seenVersion ?? 0,
      ackedVersion: parsed.ackedVersion ?? 0,
    };
  } catch {
    return { seenVersion: 0, ackedVersion: 0 };
  }
}

function writeState(key: string, state: StorageState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // private mode 등 — 저장 실패 무시 (다음 진입 시 또 안내됨)
  }
}

export function AvocadoNotice({
  notice,
  storageKey,
}: {
  notice: EntryNotice;
  storageKey: string;
}) {
  // view: 'closed' | 'bubble' | 'sheet'
  const [view, setView] = useState<"closed" | "bubble" | "sheet">("closed");
  const [acked, setAcked] = useState(false);
  const initRef = useRef(false);

  // 마운트 시: localStorage 읽고 자동 노출 결정
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const state = readState(storageKey);
    const isNew = notice.version > state.seenVersion;
    setAcked(notice.version <= state.ackedVersion);

    if (isNew) {
      // 새 버전 → 자동 노출. seenVersion 즉시 갱신해서 같은 세션 재마운트 시 또 안 뜨게.
      setView(notice.severity === "required" ? "sheet" : "bubble");
      writeState(storageKey, {
        seenVersion: notice.version,
        ackedVersion: state.ackedVersion,
      });
    }
  }, [notice.version, notice.severity, storageKey]);

  // info 말풍선 자동 닫기 (8초)
  useEffect(() => {
    if (view !== "bubble" || notice.severity !== "info") return;
    const id = window.setTimeout(() => setView("closed"), 8000);
    return () => window.clearTimeout(id);
  }, [view, notice.severity]);

  function handleAck() {
    setAcked(true);
    writeState(storageKey, {
      seenVersion: notice.version,
      ackedVersion: notice.version,
    });
    setView("closed");
  }

  function handleCloseSoft() {
    if (notice.severity === "required" && !acked) return; // 강제 닫기 차단
    setView("closed");
  }

  function handleFabTap() {
    if (notice.severity === "required" && !acked) {
      setView("sheet");
    } else {
      setView((v) => (v === "bubble" ? "closed" : "bubble"));
    }
  }

  return (
    <>
      {/* FAB — 컨테이너 우하단. 캐릭터 이미지 자체가 동그란 형태라 배경/링 없이 그대로. */}
      <button
        type="button"
        onClick={handleFabTap}
        aria-label="방장봇 안내 열기"
        className={cn(
          "absolute bottom-28 right-4 z-20 flex h-16 w-16 items-center justify-center",
          "transition-transform hover:scale-110 active:scale-95",
          // 마운트 시 살짝 통통 (한 번)
          "animate-[avo-pop_400ms_ease-out]",
          // 드롭 섀도우 — 캐릭터에 살짝 떠 있는 느낌
          "drop-shadow-[0_4px_8px_rgba(0,0,0,0.18)]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/avocado-mascot.svg"
          alt="방장봇 아보카도"
          className="h-full w-full select-none object-contain"
          draggable={false}
        />
      </button>

      {/* 말풍선 — info (또는 FAB로 다시 펼친 경우) */}
      {view === "bubble" && (
        <div
          role="dialog"
          aria-label={notice.title}
          className="absolute bottom-44 right-4 z-20 w-[min(20rem,80vw)] origin-bottom-right"
        >
          <div className="relative rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5">
            <header className="flex items-start justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icons/avocado-mascot.svg"
                  alt=""
                  className="h-5 w-5 object-contain"
                  aria-hidden
                />
                {notice.title}
              </h3>
              <button
                type="button"
                onClick={handleCloseSoft}
                aria-label="닫기"
                className="-mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
              >
                <CloseSmall />
              </button>
            </header>
            <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-zinc-700">
              {notice.body}
            </p>
            {notice.linkUrl && (
              <a
                href={notice.linkUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[12px] font-semibold text-emerald-600 underline"
              >
                자세히 보기 →
              </a>
            )}
            {/* 꼬리 — FAB 방향 */}
            <span
              aria-hidden
              className="absolute -bottom-1.5 right-7 h-3 w-3 rotate-45 bg-white ring-1 ring-black/5"
            />
          </div>
        </div>
      )}

      {/* 바텀시트 — required (또는 FAB에서 required일 때 다시 열기) */}
      {view === "sheet" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={notice.title}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseSoft();
          }}
        >
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-zinc-200" aria-hidden />
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icons/avocado-mascot.svg"
                alt=""
                className="h-8 w-8 object-contain"
                aria-hidden
              />
              <h3 className="text-[16px] font-bold text-zinc-900">{notice.title}</h3>
            </div>
            <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-zinc-700">
              {notice.body}
            </p>
            {notice.linkUrl && (
              <a
                href={notice.linkUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[13px] font-semibold text-emerald-600 underline"
              >
                자세히 보기 →
              </a>
            )}
            <button
              type="button"
              onClick={handleAck}
              className="mt-5 h-12 w-full rounded-xl bg-brand text-[15px] font-bold text-white transition-opacity active:opacity-80"
            >
              확인했어요
            </button>
            {notice.severity === "info" && (
              <button
                type="button"
                onClick={handleCloseSoft}
                className="mt-2 h-10 w-full text-[13px] text-zinc-500"
              >
                나중에 보기
              </button>
            )}
          </div>
        </div>
      )}

      {/* 마운트 통통 애니메이션 keyframe */}
      <style jsx global>{`
        @keyframes avo-pop {
          0% {
            transform: translateY(8px) scale(0.85);
            opacity: 0;
          }
          60% {
            transform: translateY(-2px) scale(1.06);
            opacity: 1;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}

function CloseSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
