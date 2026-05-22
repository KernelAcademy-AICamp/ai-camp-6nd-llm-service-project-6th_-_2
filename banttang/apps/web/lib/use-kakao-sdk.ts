"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    kakao: any;
  }
}

const SDK_SRC = (key: string) =>
  // autoload=false 필수. true로 두면 script load 이벤트는 뜨지만 kakao.maps.Map이
  // 아직 등록되지 않은 시점일 수 있음. false + kakao.maps.load(cb)로 명시 초기화한다.
  `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=services`;

export type KakaoSdkState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string }
  | { status: "no_key" };

// React Strict Mode에서 effect가 두 번 실행되어도 안전하도록 모듈 레벨 싱글톤.
let loadPromise: Promise<void> | null = null;

function loadSdk(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.kakao?.maps?.Map) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const onScriptLoaded = () => {
      if (!window.kakao?.maps?.load) {
        reject(new Error("SDK 스크립트는 받았지만 kakao.maps namespace 미정의"));
        return;
      }
      // 명시 초기화 — 이게 끝나야 Map, Marker, services 모두 사용 가능
      window.kakao.maps.load(() => {
        if (window.kakao.maps?.Map) resolve();
        else
          reject(
            new Error(
              "kakao.maps.load 콜백은 발화했으나 Map이 없음 (도메인 등록 확인)",
            ),
          );
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-banttang="kakao-sdk"]',
    );
    if (existing) {
      // 이미 추가됐으면 kakao namespace 등장을 기다림
      if (window.kakao?.maps) {
        onScriptLoaded();
      } else {
        existing.addEventListener("load", onScriptLoaded);
        existing.addEventListener("error", () =>
          reject(new Error("SDK 스크립트 fetch 실패")),
        );
      }
      return;
    }

    const s = document.createElement("script");
    s.src = SDK_SRC(key);
    s.async = true;
    s.dataset.banttang = "kakao-sdk";
    s.addEventListener("load", onScriptLoaded);
    s.addEventListener("error", () =>
      reject(new Error("SDK 스크립트 fetch 실패")),
    );
    document.head.appendChild(s);
  });

  return loadPromise;
}

export function useKakaoSdk(): KakaoSdkState {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const [state, setState] = useState<KakaoSdkState>(() => {
    if (!key || key.startsWith("your-")) return { status: "no_key" };
    if (typeof window !== "undefined" && window.kakao?.maps?.Map)
      return { status: "ready" };
    return { status: "loading" };
  });

  useEffect(() => {
    if (state.status !== "loading" || !key) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setState((s) =>
        s.status === "loading"
          ? {
              status: "error",
              message: "SDK 로드 8초 초과 — 네트워크/도메인 등록 상태 확인",
            }
          : s,
      );
    }, 8000);

    loadSdk(key)
      .then(() => {
        if (!cancelled) setState({ status: "ready" });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ status: "error", message: e.message });
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state.status, key]);

  return state;
}
