"use client";

import { useEffect, useRef } from "react";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";

// 핀 라벨 = 카테고리 칩 + 상품명 + 시간 텍스트 (프로토타입 v2와 동일 구조).
// 클릭 시 부모(onPinClick)에 알리고, 부모가 상세 카드를 지도 아래에 노출한다.
export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  emoji: string; // 카테고리 이모지
  categoryLabel: string; // 카테고리 라벨 (배달/장보기/온라인)
  productName: string; // 상품(가게)명 — store_name
  timeText: string; // "1h" / "30분" / "마감" / "방금 전" 등
};

type Props = {
  pins: MapPin[];
  selectedId?: string | null;
  onPinClick?: (id: string) => void;
  /** 지도 초기 중심. 미지정 시 신림역. */
  center?: { lat: number; lng: number };
  /** 외부에서 임의 좌표로 panTo. 객체가 새로 들어올 때마다 트리거 — 같은 좌표여도 새 객체면 다시 동작. */
  recenterTo?: { lat: number; lng: number; ts: number } | null;
  /** 사용자 현재 위치 — 지도에 파란 점으로 표시. */
  userLocation?: { lat: number; lng: number } | null;
};

const NEULIM_STATION = { lat: 37.4842, lng: 126.9296 };

export function KakaoMapView({
  pins,
  selectedId = null,
  onPinClick,
  center,
  recenterTo,
  userLocation = null,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const userOverlayRef = useRef<any>(null);
  const sdk = useKakaoSdk();
  const sdkLoaded = sdk.status === "ready";
  const error =
    sdk.status === "error"
      ? sdk.message
      : sdk.status === "no_key"
        ? "NEXT_PUBLIC_KAKAO_MAP_KEY 설정 필요"
        : null;

  // SDK 로드 후 지도 초기화
  useEffect(() => {
    if (!sdkLoaded || !mapEl.current) return;
    if (!window.kakao?.maps?.Map) return;
    const c = center ?? NEULIM_STATION;
    const map = new window.kakao.maps.Map(mapEl.current, {
      center: new window.kakao.maps.LatLng(c.lat, c.lng),
      level: 4,
      draggable: true,
      scrollwheel: true,
    });
    mapRef.current = map;
  }, [sdkLoaded, center]);

  // pins/selectedId 변경 시 오버레이 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    overlaysRef.current.forEach((ov) => ov.setMap(null));
    overlaysRef.current = [];

    for (const p of pins) {
      if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
      const isSelected = p.id === selectedId;
      const html = `
        <div class="feed-pin ${isSelected ? "feed-pin--on" : ""}" data-pid="${p.id}">
          <div class="feed-pin__bubble">
            <span class="feed-pin__chip">${escapeHtml(p.emoji)} ${escapeHtml(p.categoryLabel)}</span>
            <span class="feed-pin__product">${escapeHtml(p.productName)}</span>
            <span class="feed-pin__time">🕒 ${escapeHtml(p.timeText)}</span>
          </div>
          <div class="feed-pin__tail"></div>
        </div>
      `;
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(p.lat, p.lng),
        content: html,
        yAnchor: 1.15,
        clickable: true,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    // 핀 다 들어오게 bounds (선택 변경만으로는 줌 재조정 불필요하지만,
    // 데이터 변경에도 같은 effect에서 처리하므로 함께 적용).
    if (pins.length > 0) {
      const bounds = new window.kakao.maps.LatLngBounds();
      for (const p of pins) {
        if (typeof p.lat === "number" && typeof p.lng === "number") {
          bounds.extend(new window.kakao.maps.LatLng(p.lat, p.lng));
        }
      }
      if (!bounds.isEmpty()) map.setBounds(bounds, 60, 60, 60, 60);
    }
  }, [pins, selectedId]);

  // selectedId 변경 시 해당 핀으로 panTo
  useEffect(() => {
    if (!selectedId) return;
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    const p = pins.find((x) => x.id === selectedId);
    if (!p) return;
    map.panTo(new window.kakao.maps.LatLng(p.lat, p.lng));
  }, [selectedId, pins]);

  // recenterTo 트리거 — 외부에서 "내 위치로 이동" 같은 액션이 들어왔을 때 panTo.
  useEffect(() => {
    if (!recenterTo) return;
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    map.panTo(new window.kakao.maps.LatLng(recenterTo.lat, recenterTo.lng));
  }, [recenterTo]);

  // 사용자 현재 위치 — 파란 점 + 외곽 펄스. 변경 시 기존 오버레이 정리하고 새로 그림.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    if (userOverlayRef.current) {
      userOverlayRef.current.setMap(null);
      userOverlayRef.current = null;
    }
    if (!userLocation) return;
    const html = `<div class="feed-mypos"><div class="feed-mypos__dot"></div></div>`;
    const overlay = new window.kakao.maps.CustomOverlay({
      position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
      content: html,
      yAnchor: 0.5,
      xAnchor: 0.5,
      zIndex: 5,
    });
    overlay.setMap(map);
    userOverlayRef.current = overlay;
  }, [userLocation]);

  // 핀 클릭 — CustomOverlay HTML에 직접 onClick을 못 박아서 이벤트 위임
  useEffect(() => {
    const root = mapEl.current;
    if (!root || !onPinClick) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const pin = target.closest<HTMLElement>(".feed-pin");
      if (!pin) return;
      const pid = pin.getAttribute("data-pid");
      if (pid) onPinClick(pid);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [onPinClick]);

  if (sdk.status === "no_key") {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
        NEXT_PUBLIC_KAKAO_MAP_KEY 설정 필요
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        .feed-pin {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translateY(0);
          transition: transform 120ms ease;
        }
        .feed-pin:hover {
          transform: translateY(-2px);
        }
        .feed-pin__bubble {
          background: white;
          color: #18181b;
          padding: 6px 10px;
          border-radius: 14px;
          border: 1.5px solid #7fb069;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          white-space: nowrap;
          min-width: 96px;
        }
        .feed-pin__chip {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 999px;
          background: rgba(127, 176, 105, 0.14);
          color: #4f7c3a;
          font-size: 10px;
          font-weight: 700;
          line-height: 1.4;
          margin-bottom: 2px;
        }
        .feed-pin__product {
          font-size: 12px;
          font-weight: 700;
          color: #18181b;
          line-height: 1.2;
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .feed-pin__time {
          font-size: 10px;
          color: #71717a;
          line-height: 1.2;
        }
        .feed-pin__tail {
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 7px solid #7fb069;
          margin-top: -1px;
        }
        .feed-pin--on .feed-pin__bubble {
          background: #7fb069;
          color: white;
          border-color: #6a9659;
        }
        .feed-pin--on .feed-pin__chip {
          background: rgba(255, 255, 255, 0.22);
          color: white;
        }
        .feed-pin--on .feed-pin__product,
        .feed-pin--on .feed-pin__time {
          color: white;
        }
        .feed-pin--on .feed-pin__tail {
          border-top-color: #6a9659;
        }

        /* 사용자 현재 위치 — 파란 점 + 펄스 외곽 */
        .feed-mypos {
          position: relative;
          width: 16px;
          height: 16px;
        }
        .feed-mypos::before {
          content: "";
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.22);
          animation: feed-mypos-pulse 1.6s ease-out infinite;
        }
        .feed-mypos__dot {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: #3b82f6;
          border: 2.5px solid white;
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.6);
        }
        @keyframes feed-mypos-pulse {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200">
        <div ref={mapEl} className="h-72 w-full" />
        {error && (
          <p className="absolute inset-0 flex items-center justify-center bg-white/80 px-4 text-center text-xs text-rose-500">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]!);
}
