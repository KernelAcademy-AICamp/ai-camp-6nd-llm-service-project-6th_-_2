"use client";

import { useEffect, useRef } from "react";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  emoji: string;
  label: string;
  productName: string;
  timeWindow: string;
};

interface Props {
  pins: MapPin[];
  selectedId: string | null;
  onPinClick: (id: string) => void;
}

// 신림역 중심
const CENTER = { lat: 37.4842, lng: 126.9293 };

export function MapView({ pins, selectedId, onPinClick }: Props) {
  const sdk = useKakaoSdk();
  const ready = sdk.status === "ready";
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  // 초기화
  useEffect(() => {
    if (!ready || !mapEl.current || !window.kakao?.maps?.Map) return;
    const k = window.kakao;
    const map = new k.maps.Map(mapEl.current, {
      center: new k.maps.LatLng(CENTER.lat, CENTER.lng),
      level: 4,
    });
    mapRef.current = map;
  }, [ready]);

  // 오버레이 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    const k = window.kakao;

    // 기존 오버레이 제거
    overlaysRef.current.forEach((ov) => ov.setMap(null));
    overlaysRef.current = [];

    for (const p of pins) {
      const isSelected = p.id === selectedId;
      const html = `
        <div class="proto-pin ${isSelected ? "proto-pin--on" : ""}" data-pid="${p.id}">
          <div class="proto-pin__bubble">
            <span class="proto-pin__chip">${escapeHtml(p.emoji)} ${escapeHtml(p.label)}</span>
            <span class="proto-pin__product">${escapeHtml(p.productName)}</span>
            <span class="proto-pin__time">🕒 ${escapeHtml(p.timeWindow)}</span>
          </div>
          <div class="proto-pin__tail"></div>
        </div>
      `;
      const overlay = new k.maps.CustomOverlay({
        position: new k.maps.LatLng(p.lat, p.lng),
        content: html,
        yAnchor: 1.15,
        clickable: true,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    // 모든 핀이 들어오게 bounds
    if (pins.length > 0) {
      const bounds = new k.maps.LatLngBounds();
      pins.forEach((p) => bounds.extend(new k.maps.LatLng(p.lat, p.lng)));
      map.setBounds(bounds, 50, 50, 50, 50);
    } else {
      map.setCenter(new k.maps.LatLng(CENTER.lat, CENTER.lng));
      map.setLevel(4);
    }
  }, [pins, selectedId]);

  // selectedId 변경 시 해당 핀 위치로 살짝 zoom
  useEffect(() => {
    if (!selectedId) return;
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    const p = pins.find((x) => x.id === selectedId);
    if (!p) return;
    map.panTo(new window.kakao.maps.LatLng(p.lat, p.lng));
  }, [selectedId, pins]);

  // 핀 클릭 — CustomOverlay HTML에 직접 onClick을 못 박아서 이벤트 위임
  useEffect(() => {
    const root = mapEl.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const pin = target.closest<HTMLElement>(".proto-pin");
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
        NEXT_PUBLIC_KAKAO_MAP_KEY 미설정
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        .proto-pin {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translateY(0);
          transition: transform 120ms ease;
        }
        .proto-pin:hover {
          transform: translateY(-2px);
        }
        .proto-pin__bubble {
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
        .proto-pin__chip {
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
        .proto-pin__product {
          font-size: 12px;
          font-weight: 700;
          color: #18181b;
          line-height: 1.2;
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .proto-pin__time {
          font-size: 10px;
          color: #71717a;
          line-height: 1.2;
        }
        .proto-pin__tail {
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 7px solid #7fb069;
          margin-top: -1px;
        }
        .proto-pin--on .proto-pin__bubble {
          background: #7fb069;
          color: white;
          border-color: #6a9659;
        }
        .proto-pin--on .proto-pin__chip {
          background: rgba(255, 255, 255, 0.22);
          color: white;
        }
        .proto-pin--on .proto-pin__product,
        .proto-pin--on .proto-pin__time {
          color: white;
        }
        .proto-pin--on .proto-pin__tail {
          border-top-color: #6a9659;
        }
      `}</style>
      <div
        ref={mapEl}
        className="h-64 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
      />
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}
