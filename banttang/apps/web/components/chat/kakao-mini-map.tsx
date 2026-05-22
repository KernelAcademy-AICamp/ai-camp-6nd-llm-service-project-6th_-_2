"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  // 메인 핀 좌표 (추천 장소)
  lat: number;
  lng: number;
  // 호버 라벨 — 없으면 핀만
  title?: string;
  // 지도 확대 레벨 (카카오 기준 1=가장 가까움, 14=가장 멈)
  level?: number;
  className?: string;
}

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => unknown;
        Map: new (container: HTMLElement, opts: Record<string, unknown>) => {
          setCenter: (latlng: unknown) => void;
          relayout: () => void;
        };
        Marker: new (opts: Record<string, unknown>) => unknown;
        MarkerImage: new (
          src: string,
          size: unknown,
          opts?: Record<string, unknown>,
        ) => unknown;
        Size: new (w: number, h: number) => unknown;
        Point: new (x: number, y: number) => unknown;
        CustomOverlay: new (opts: Record<string, unknown>) => unknown;
      };
    };
  }
}

// 카드 내부에 끼우는 컴팩트 카카오맵. 드래그/줌 비활성화로 정적 디스플레이.
export function KakaoMiniMap({
  lat,
  lng,
  title,
  level = 4,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SDK 로드 대기 (autoload=false 라 kakao.maps.load 콜백을 기다린다).
  // 5초 안에 안 잡히면 에러 메시지 노출 — 무한 로딩 방지.
  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    function tryLoad() {
      if (cancelled) return;
      if (window.kakao?.maps) {
        try {
          window.kakao.maps.load(() => {
            if (!cancelled) setReady(true);
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "지도 초기화 실패");
        }
        return;
      }
      if (Date.now() - start > 5000) {
        setError("카카오맵 SDK 로드 실패. 잠시 후 새로고침해주세요.");
        return;
      }
      setTimeout(tryLoad, 100);
    }
    tryLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  // 지도 초기화 + 마커 배치
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const kakao = window.kakao!;
    const center = new kakao.maps.LatLng(lat, lng);
    const map = new kakao.maps.Map(containerRef.current, {
      center,
      level,
      draggable: false,
      scrollwheel: false,
      disableDoubleClick: true,
      disableDoubleClickZoom: true,
    });

    // 메인 핀 (POI)
    new kakao.maps.Marker({ position: center, map });

    // 라벨 오버레이 (제목)
    if (title) {
      const content = document.createElement("div");
      content.className =
        "pointer-events-none -translate-y-9 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-gray-900 shadow ring-1 ring-black/10";
      content.textContent = title;
      new kakao.maps.CustomOverlay({
        position: center,
        content,
        yAnchor: 1,
        xAnchor: 0.5,
        map,
      });
    }

    // 컨테이너 크기 변동 시 맵 다시 그리기 (탭/스크롤 컨테이너 안에서 안전)
    setTimeout(() => map.relayout(), 0);
  }, [ready, lat, lng, title, level]);

  return (
    <div className={cn("relative h-44 w-full overflow-hidden rounded-xl bg-gray-100", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-gray-400">
          지도 불러오는 중...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[12px] text-rose-600">
          {error}
        </div>
      )}
    </div>
  );
}
