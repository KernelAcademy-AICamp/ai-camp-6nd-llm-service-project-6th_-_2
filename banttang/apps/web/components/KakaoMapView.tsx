"use client";

import { useEffect, useRef, useState } from "react";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  store_name: string;
  occupied: number;
  max: number;
  remain_min: number;
  display_status_label: string;
  pickup_name: string | null;
};

type Props = {
  pins: MapPin[];
  /** 지도 초기 중심. 미지정 시 신림역. */
  center?: { lat: number; lng: number };
};

const NEULIM_STATION = { lat: 37.4842, lng: 126.9296 };

export function KakaoMapView({ pins, center }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
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
      level: 4, // 1~14, 작을수록 확대
      draggable: true,
      scrollwheel: true,
    });
    mapRef.current = map;
  }, [sdkLoaded, center]);

  // pins 변경 시 오버레이 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;
    overlaysRef.current.forEach((ov) => ov.setMap(null));
    overlaysRef.current = [];

    for (const p of pins) {
      if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
      const html = `
        <a href="/feed/${p.id}" style="text-decoration:none;color:inherit;">
          <div class="banttang-bubble">
            <div class="banttang-bubble__title">${escapeHtml(p.store_name)}</div>
            <div class="banttang-bubble__meta">
              <span class="banttang-bubble__badge">${escapeHtml(p.display_status_label)}</span>
              <span>${p.occupied}/${p.max}명</span>
              <span>·</span>
              <span>${p.remain_min > 60 ? Math.floor(p.remain_min / 60) + "h" : p.remain_min > 0 ? p.remain_min + "분" : "지남"}</span>
            </div>
            <div class="banttang-bubble__tail"></div>
          </div>
        </a>
      `;
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(p.lat, p.lng),
        content: html,
        yAnchor: 1.15, // tail 위로 살짝 띄움
        clickable: true,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    // 핀이 있으면 화면에 다 들어오게 bounds 맞춤
    if (pins.length > 0) {
      const bounds = new window.kakao.maps.LatLngBounds();
      for (const p of pins) {
        if (typeof p.lat === "number" && typeof p.lng === "number") {
          bounds.extend(new window.kakao.maps.LatLng(p.lat, p.lng));
        }
      }
      if (!bounds.isEmpty()) map.setBounds(bounds, 60, 60, 60, 60);
    }
  }, [pins]);

  if (sdk.status === "no_key") {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
        NEXT_PUBLIC_KAKAO_MAP_KEY 설정 필요
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200">
      <div ref={mapEl} className="h-72 w-full" />
      {error && (
        <p className="absolute inset-0 flex items-center justify-center bg-white/80 px-4 text-center text-xs text-rose-500">
          {error}
        </p>
      )}
    </div>
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
