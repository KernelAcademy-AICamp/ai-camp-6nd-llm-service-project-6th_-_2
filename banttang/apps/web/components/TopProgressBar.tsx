"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// 상단 네비게이션 진행바 (유튜브/깃허브 스타일).
// 외부 의존성 없이 App Router에서 동작한다:
//   - 시작: 내부 링크(<a>) 클릭을 캡처해서 바를 0→90%까지 서서히 채움
//   - 완료: usePathname 변경(=이동 완료)을 감지해 100%로 채운 뒤 사라짐
// 채팅방처럼 서버 렌더가 느린 경로로 이동할 때 즉각적인 피드백을 준다.
export function TopProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0); // 0~100
  const [active, setActive] = useState(false);

  // 핸들러에서 최신 active 값을 읽기 위한 ref
  const activeRef = useRef(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  const clearTimers = () => {
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
    if (hideRef.current) {
      clearTimeout(hideRef.current);
      hideRef.current = null;
    }
  };

  const start = () => {
    clearTimers();
    activeRef.current = true;
    setActive(true);
    setProgress(8);
    // 90%까지 점점 차오르다 멈춤 (실제 완료는 라우트 변경 시 100%)
    trickleRef.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(0.4, (90 - p) * 0.08) : p));
    }, 180);
  };

  const finish = () => {
    clearTimers();
    activeRef.current = false;
    setProgress(100);
    hideRef.current = setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, 220);
  };

  // 내부 링크 클릭 → 시작
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // 같은 경로(쿼리만 다르거나 동일)면 표시 안 함
      if (url.pathname === window.location.pathname) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 라우트(pathname) 변경 = 이동 완료. 시작했던 경우에만 마무리.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (activeRef.current) finish();
  }, [pathname]);

  // 언마운트 정리
  useEffect(() => () => clearTimers(), []);

  if (!active && progress === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className="h-full bg-brand shadow-[0_0_8px_rgba(127,176,105,0.7)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: active ? 1 : 0 }}
      />
    </div>
  );
}
