"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";

type Stage = "search" | "map";
type Coords = { lat: number; lng: number };
type Address = { road: string | null; jibun: string | null; building: string | null };
export type AliasKey = "home" | "school";
export const ALIAS_LABEL: Record<AliasKey, string> = { home: "집", school: "학교" };

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
function SchoolIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />
    </svg>
  );
}
const ALIAS_ICON_COMP: Record<AliasKey, (p: { className?: string }) => JSX.Element> = {
  home: HomeIcon,
  school: SchoolIcon,
};

const FALLBACK: Coords = { lat: 37.4842, lng: 126.9296 }; // 신림역

function aliasKey(userId: string, alias: AliasKey) {
  return `banttang_addr_${userId}_${alias}`;
}
type AliasValue = { label: string; lat?: number; lng?: number };
export function loadAlias(userId: string, alias: AliasKey): AliasValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(aliasKey(userId, alias));
    if (!raw) return null;
    // 구버전 호환: 문자열만 저장된 케이스
    if (!raw.startsWith("{")) return { label: raw };
    return JSON.parse(raw) as AliasValue;
  } catch {
    return null;
  }
}
export function saveAlias(userId: string, alias: AliasKey, value: AliasValue) {
  try {
    window.localStorage.setItem(aliasKey(userId, alias), JSON.stringify(value));
  } catch {}
}

export function AddressOnboardingClient({ userId }: { userId: string }) {
  const router = useRouter();
  const sdk = useKakaoSdk();
  const sdkReady = sdk.status === "ready";
  const [stage, setStage] = useState<Stage>("search");
  const [pickedCoords, setPickedCoords] = useState<Coords | null>(null);
  const [pickedLabel, setPickedLabel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 사용자가 집/학교 신규 등록 의도로 들어왔다면 confirm 시 localStorage에도 저장
  const [saveAs, setSaveAs] = useState<AliasKey | null>(null);
  // 미등록 단축 클릭 시 띄우는 확인 모달
  const [registerPrompt, setRegisterPrompt] = useState<AliasKey | null>(null);

  function gotoMap(c: Coords) {
    setPickedCoords(c);
    setStage("map");
  }

  async function applyAddress(label: string, coords?: Coords) {
    setBusy(true);
    const res = await fetch("/api/onboarding/address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "manual",
        address: label,
        lat: coords?.lat,
        lng: coords?.lng,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("저장 실패");
      return false;
    }
    router.push("/feed");
    router.refresh();
    return true;
  }

  async function confirm() {
    if (!pickedCoords || !pickedLabel) return;
    if (saveAs)
      saveAlias(userId, saveAs, {
        label: pickedLabel,
        lat: pickedCoords.lat,
        lng: pickedCoords.lng,
      });
    await applyAddress(pickedLabel, pickedCoords);
  }

  // 저장된 집/학교 단축 적용 (저장 있을 때) or 등록 확인 모달 (저장 없을 때)
  function handleAliasClick(alias: AliasKey) {
    const saved = loadAlias(userId, alias);
    if (saved) {
      const c =
        typeof saved.lat === "number" && typeof saved.lng === "number"
          ? { lat: saved.lat, lng: saved.lng }
          : undefined;
      applyAddress(saved.label, c);
      return;
    }
    setRegisterPrompt(alias);
  }

  // 모달의 "등록하기" → 등록 모드 활성화 + 지도 단계로 바로 진입
  function startRegister(alias: AliasKey) {
    setRegisterPrompt(null);
    setSaveAs(alias);
    setPickedCoords(FALLBACK);
    setStage("map");
  }

  return (
    <div className="flex min-h-[calc(100vh-3.75rem)] flex-col">
      {sdk.status === "error" && (
        <div className="m-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
          <p className="font-semibold">카카오 지도 SDK 로드 실패</p>
          <p className="mt-1">{sdk.message}</p>
          <p className="mt-2 text-rose-500">
            가능한 원인: 1) JS 키 오타 2) 카카오 콘솔 → 플랫폼 → Web 사이트 도메인에{" "}
            <code>http://localhost:3000</code> 미등록 3) 네트워크 차단
          </p>
        </div>
      )}
      {sdk.status === "no_key" && (
        <div className="m-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          NEXT_PUBLIC_KAKAO_MAP_KEY가 .env.local에 설정돼 있지 않습니다.
        </div>
      )}

      {stage === "search" && (
        <SearchStage
          sdkReady={sdkReady}
          onPicked={gotoMap}
          onAliasClick={handleAliasClick}
          saveAs={saveAs}
        />
      )}

      {stage === "map" && pickedCoords && (
        <MapStage
          sdkReady={sdkReady}
          initial={pickedCoords}
          onBack={() => setStage("search")}
          onAddressChange={(c, label) => {
            setPickedCoords(c);
            setPickedLabel(label);
          }}
          busy={busy}
          error={error}
          onConfirm={confirm}
          saveAs={saveAs}
        />
      )}

      {registerPrompt && (
        <RegisterPromptModal
          alias={registerPrompt}
          onBack={() => setRegisterPrompt(null)}
          onRegister={() => startRegister(registerPrompt)}
        />
      )}
    </div>
  );
}

function RegisterPromptModal({
  alias,
  onBack,
  onRegister,
}: {
  alias: AliasKey;
  onBack: () => void;
  onRegister: () => void;
}) {
  return (
    <div
      onClick={onBack}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl bg-white p-5 text-center"
      >
        <h3 className="text-base font-semibold">등록된 주소가 없어요.</h3>
        <p className="mt-1 text-xs text-zinc-500">
          {ALIAS_LABEL[alias]} 주소를 등록하시겠어요?
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onBack}
            className="flex-1 rounded-xl border border-zinc-200 py-2 text-sm text-zinc-600"
          >
            뒤로가기
          </button>
          <button
            onClick={onRegister}
            className="flex-1 rounded-xl bg-brand py-2 text-sm font-medium text-white"
          >
            등록하기
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ SEARCH STAGE ------------------------------ */

function SearchStage({
  sdkReady,
  onPicked,
  onAliasClick,
  saveAs,
}: {
  sdkReady: boolean;
  onPicked: (c: Coords) => void;
  onAliasClick: (alias: AliasKey) => void;
  saveAs: AliasKey | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ name: string; address: string; lat: number; lng: number }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  // 디바운스 검색
  useEffect(() => {
    if (!sdkReady || !window.kakao?.maps?.services) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      setSearching(true);
      const places = new window.kakao.maps.services.Places();
      places.keywordSearch(q, (data: any[], status: any) => {
        setSearching(false);
        if (status !== window.kakao.maps.services.Status.OK) {
          setResults([]);
          return;
        }
        setResults(
          data.slice(0, 15).map((d) => ({
            name: d.place_name,
            address: d.road_address_name || d.address_name,
            lat: parseFloat(d.y),
            lng: parseFloat(d.x),
          })),
        );
      });
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, sdkReady]);

  function useCurrentLocation() {
    setError(null);
    if (!navigator.geolocation) {
      onPicked(FALLBACK);
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        onPicked({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("위치 권한이 거부되었어요. 기본 위치로 이동합니다.");
        } else {
          setError("위치를 가져오지 못했어요. 기본 위치로 이동합니다.");
        }
        onPicked(FALLBACK);
      },
      { timeout: 8000 },
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <header>
        <h1 className="text-lg font-bold">위치 설정</h1>
        <p className="text-xs text-zinc-500">같은 동네 이웃과 매칭하기 위해 필요해요.</p>
      </header>

      <button
        onClick={useCurrentLocation}
        disabled={geoLoading}
        className="flex items-center justify-center gap-2 rounded-xl border border-brand bg-brand-50 px-4 py-3 font-medium text-brand disabled:opacity-50"
      >
        <span>📍</span>
        <span>{geoLoading ? "현재 위치 확인 중…" : "현재 위치로 찾기"}</span>
      </button>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="도로명, 지번, 건물명으로 검색"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
            검색 중…
          </span>
        )}
      </div>

      {/* 집/학교 단축 — 저장돼 있으면 1탭 적용, 없으면 검색 흐름 진입 */}
      <div className="flex gap-5 px-1">
        {(["home", "school"] as const).map((alias) => {
          const Icon = ALIAS_ICON_COMP[alias];
          return (
            <button
              key={alias}
              onClick={() => onAliasClick(alias)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-brand"
            >
              <Icon />
              <span>{ALIAS_LABEL[alias]}</span>
            </button>
          );
        })}
      </div>

      {query.trim() && results.length === 0 && !searching && (
        <p className="rounded-xl bg-white p-4 text-center text-xs text-zinc-400">
          검색 결과가 없어요
        </p>
      )}

      {results.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {results.map((r, i) => (
            <li key={i} className="border-b border-zinc-100 last:border-0">
              <button
                onClick={() => onPicked({ lat: r.lat, lng: r.lng })}
                className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-brand-50"
              >
                <span className="text-sm font-medium">{r.name}</span>
                <span className="text-[11px] text-zinc-500">{r.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------- MAP STAGE ------------------------------- */

function MapStage({
  sdkReady,
  initial,
  onBack,
  onAddressChange,
  onConfirm,
  busy,
  error,
  saveAs,
}: {
  sdkReady: boolean;
  initial: Coords;
  onBack: () => void;
  onAddressChange: (c: Coords, label: string) => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
  saveAs: AliasKey | null;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const placesRef = useRef<any>(null);
  const verifiedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<Address>({ road: null, jibun: null, building: null });
  const [resolving, setResolving] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  // 지도 위 검색
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ name: string; address: string; lat: number; lng: number }>
  >([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  function resolve(lat: number, lng: number) {
    const k = window.kakao;
    if (!k?.maps?.services || !geocoderRef.current) return;
    setResolving(true);
    geocoderRef.current.coord2Address(lng, lat, (result: any[], status: any) => {
      setResolving(false);
      if (status !== k.maps.services.Status.OK || !result.length) {
        const fallback = `(${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        setAddress({ road: null, jibun: null, building: fallback });
        onAddressChange({ lat, lng }, fallback);
        return;
      }
      const r = result[0];
      const road = r.road_address?.address_name ?? null;
      const jibun = r.address?.address_name ?? null;
      const building = r.road_address?.building_name || null;
      setAddress({ road, jibun, building });
      onAddressChange({ lat, lng }, road || jibun || "주소 미확인");
    });
  }

  async function verifyCurrentLocation() {
    if (!navigator.geolocation) {
      alert("이 브라우저는 위치 정보를 지원하지 않아요.");
      return;
    }

    // Permissions API로 사전 체크 — 이미 거부 상태면 브라우저가 프롬프트를 안 띄움
    if (navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({
          name: "geolocation" as PermissionName,
        });
        if (perm.state === "denied") {
          alert(
            "위치 사용 권한이 차단돼 있어요.\n\n브라우저 주소창 왼쪽의 자물쇠/i 아이콘 → 사이트 설정에서 '위치'를 '허용'으로 바꿔주세요.",
          );
          return;
        }
      } catch {
        // Permissions API 미지원 환경 — 그냥 geolocation 호출
      }
    }

    setVerifyError(null);
    setVerifying(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        verifiedCoordsRef.current = { lat, lng };
        const k = window.kakao;
        const center = new k.maps.LatLng(lat, lng);
        mapRef.current?.panTo(center);
        setVerified(true);
        setVerifying(false);
        // panTo가 idle 이벤트를 발화시키지만 명시 reverse-geocode도 한 번 호출
        setTimeout(() => resolve(lat, lng), 400);
      },
      (err) => {
        setVerifying(false);
        setVerified(false);
        verifiedCoordsRef.current = null;
        if (err.code === err.PERMISSION_DENIED) {
          alert(
            "위치 사용 권한이 거부됐어요.\n\n브라우저 설정에서 허용으로 바꾼 뒤 다시 시도해주세요.",
          );
        } else {
          setVerifyError("현재 위치를 가져오지 못했어요.");
        }
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  // 인증된 좌표에서 일정 거리 이상 이동하면 인증 해제
  function maybeRevokeVerified(lat: number, lng: number) {
    const v = verifiedCoordsRef.current;
    if (!v) return;
    const dx = (lat - v.lat) * 111_000;
    const dy = (lng - v.lng) * 88_000;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 30) {
      // 30m 넘게 옮기면 인증 무효
      setVerified(false);
      verifiedCoordsRef.current = null;
    }
  }

  // 지도 위 검색 — 디바운스 후 Places 결과 갱신
  useEffect(() => {
    if (!sdkReady || !placesRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      setSearching(true);
      placesRef.current.keywordSearch(q, (data: any[], status: any) => {
        setSearching(false);
        if (status !== window.kakao.maps.services.Status.OK) {
          setResults([]);
          return;
        }
        setResults(
          data.slice(0, 8).map((d) => ({
            name: d.place_name,
            address: d.road_address_name || d.address_name,
            lat: parseFloat(d.y),
            lng: parseFloat(d.x),
          })),
        );
      });
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, sdkReady]);

  function pickResult(r: { name: string; address: string; lat: number; lng: number }) {
    setQuery("");
    setResults([]);
    const k = window.kakao;
    if (!k?.maps || !mapRef.current) return;
    mapRef.current.panTo(new k.maps.LatLng(r.lat, r.lng));
    // panTo가 idle 이벤트를 발화 → 자동으로 reverse-geocode
  }

  useEffect(() => {
    if (!sdkReady || !mapEl.current || !window.kakao?.maps?.Map) return;
    const k = window.kakao;
    const center = new k.maps.LatLng(initial.lat, initial.lng);
    const map = new k.maps.Map(mapEl.current, { center, level: 3 });
    mapRef.current = map;
    geocoderRef.current = new k.maps.services.Geocoder();
    placesRef.current = new k.maps.services.Places();
    // 지도 이동(드래그/줌) 종료 시 중심 좌표로 주소 갱신
    k.maps.event.addListener(map, "idle", () => {
      const c = map.getCenter();
      const lat = c.getLat();
      const lng = c.getLng();
      maybeRevokeVerified(lat, lng);
      resolve(lat, lng);
    });
    // 초기 1회
    resolve(initial.lat, initial.lng);
  }, [sdkReady]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-zinc-100 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-sm text-zinc-500">← 검색</button>
          <h2 className="text-sm font-semibold">위치 미세 조정</h2>
        </div>
        {/* 검색 입력 — 지도 이동의 빠른 대안 */}
        <div className="relative mt-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="도로명, 지번, 건물명 검색"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
              검색 중…
            </span>
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-[20rem]">
        {/* 검색 결과 dropdown — 지도 위에 겹쳐서 */}
        {results.length > 0 && (
          <ul className="absolute left-3 right-3 top-3 z-30 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
            {results.map((r, i) => (
              <li key={i} className="border-b border-zinc-100 last:border-0">
                <button
                  onClick={() => pickResult(r)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-brand-50"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-[11px] text-zinc-500">{r.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div ref={mapEl} className="absolute inset-0 bg-zinc-100" />
        {/* 중앙 고정 핀 — kakao 지도 DOM 위로 띄우기 위해 z-20 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-full">
          <div className="flex flex-col items-center">
            <div className="rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white shadow-md">
              여기로 설정
            </div>
            <div className="-mt-0.5 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-brand" />
            <div className="mt-1 h-2 w-2 rounded-full bg-brand shadow-md ring-2 ring-white" />
          </div>
        </div>
        {/* 현재 위치 인증 버튼 */}
        <button
          onClick={verifyCurrentLocation}
          disabled={verifying}
          className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-medium shadow-md ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
        >
          📍 {verifying ? "확인 중…" : "현재 위치로"}
        </button>
        {!sdkReady && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
            카카오 지도 SDK 로드 중…
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-zinc-400">지도를 움직여서 정확한 위치를 맞춰주세요</p>
          {verified && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              ✓ 현재 위치 인증됨
            </span>
          )}
        </div>
        <div className="mt-2 space-y-0.5">
          {resolving ? (
            <p className="text-sm text-zinc-400">주소 확인 중…</p>
          ) : (
            <>
              {address.building && (
                <p className="text-base font-semibold">{address.building}</p>
              )}
              {address.road && <p className="text-sm">{address.road}</p>}
              {address.jibun && (
                <p className="text-xs text-zinc-500">(지번) {address.jibun}</p>
              )}
              {!address.road && !address.jibun && !address.building && (
                <p className="text-sm text-zinc-400">주소를 확인할 수 없는 위치</p>
              )}
            </>
          )}
        </div>
        {verifyError && <p className="mt-2 text-xs text-rose-500">{verifyError}</p>}
        {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
        <button
          onClick={onConfirm}
          disabled={busy || resolving || (!address.road && !address.jibun && !address.building)}
          className="mt-3 w-full rounded-xl bg-brand py-3 font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {busy
            ? "저장 중…"
            : saveAs
              ? `이 주소 ${ALIAS_LABEL[saveAs]}으로 등록하기`
              : "이 위치로 설정"}
        </button>
      </div>
    </div>
  );
}
