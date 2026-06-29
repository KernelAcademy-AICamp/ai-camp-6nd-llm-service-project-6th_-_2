"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";
import { cn } from "@/lib/utils";

// 가입 직후 보여주는 거주지 선택 — 동네(신림/강남/기타) → 건물(3종) 또는 직접 검색.
// 좌표는 Kakao Local API로 미리 지오코딩해 박아둠. 검색은 Kakao Places(JS SDK) 사용.
// 최종 선택 시 /api/onboarding/address (POST) {method:"manual", address, lat, lng} 로 전송.

type Building = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};
type Area = {
  id: "sillim" | "gangnam" | "etc";
  label: string;
  emoji: string;
  desc: string;
  buildings: Building[];
};

const AREAS: Area[] = [
  {
    id: "sillim",
    label: "신림",
    emoji: "🌿",
    desc: "서울 관악구 · 1인 가구 밀집 동네",
    buildings: [
      {
        id: "sammo-prime",
        name: "삼모 더 프라임 타워",
        address: "서울 관악구 신원로 35",
        lat: 37.4823122,
        lng: 126.929023,
      },
      {
        id: "seonintown",
        name: "선인타운",
        address: "서울 관악구 관천로 44",
        lat: 37.4835424,
        lng: 126.927279,
      },
      {
        id: "leaders",
        name: "리더스 오피스텔",
        address: "서울 관악구 남부순환로185길 13",
        lat: 37.485392,
        lng: 126.932271,
      },
    ],
  },
  {
    id: "gangnam",
    label: "강남",
    emoji: "🏙",
    desc: "서울 강남구 · 직장인 밀집 동네",
    buildings: [
      {
        id: "gangnam-358",
        name: "강남 358 타워",
        address: "서울 강남구 강남대로 358",
        lat: 37.495059,
        lng: 127.029794,
      },
      {
        id: "halla-studio-193",
        name: "한라비발디 스튜디오193",
        address: "서울 서초구 강남대로39길 15-10 (강남역)",
        lat: 37.48573,
        lng: 127.0321,
      },
      {
        id: "maru-180",
        name: "MARU 180",
        address: "서울 강남구 역삼로 180",
        lat: 37.495454,
        lng: 127.038858,
      },
    ],
  },
  {
    id: "etc",
    label: "기타",
    emoji: "🔎",
    desc: "다른 동네 — 주소를 직접 검색해 등록",
    buildings: [], // 건물 목록 대신 검색 UI 만 노출
  },
];

type Step = "area" | "building";

export function AddressPickerClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("area");
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function applyLocation(name: string, address: string, lat: number, lng: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // 기타 동네는 profiles.residence(=커뮤니티 거주지 탭 식별자)를 비워둔다.
      // 이러면 커뮤니티에서 "{닉네임}님의 동네 준비중" 으로 노출됨.
      // 신림/강남은 건물명(or 검색 결과명)을 detail 로 보내 residence 갱신.
      const isEtc = area?.id === "etc";
      const res = await fetch("/api/onboarding/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "manual",
          address: `${name} (${address})`,
          lat,
          lng,
          ...(isEtc ? {} : { detail: name }),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        setError(j?.error ?? "거주지 설정에 실패했어요. 잠시 후 다시 시도해 주세요.");
        setBusy(false);
        return;
      }
      // 등록 직후 "같은 건물 이웃과 띵동 등록" 유도 환영 페이지로 이동.
      router.replace("/onboarding/welcome" as any);
      router.refresh();
    } catch {
      setError("네트워크 오류로 거주지 설정에 실패했어요.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-zinc-50 px-4 py-8">
      <header className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight text-zinc-900">
          어디 살고 계세요?
        </h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          내 동네 이웃과 매칭하기 위해 거주지를 선택해 주세요.
        </p>
      </header>

      {/* Step 1: 동네 선택 */}
      {step === "area" && (
        <div className="flex flex-col gap-3">
          {AREAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setArea(a);
                setStep("building");
              }}
              className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 text-left transition active:bg-zinc-50"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand/[0.08] text-[28px]">
                {a.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold text-zinc-900">{a.label}</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">{a.desc}</p>
              </div>
              <span className="text-zinc-300">›</span>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: 건물 선택(+검색) */}
      {step === "building" && area && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[20px]">{area.emoji}</span>
            <h2 className="text-[16px] font-bold text-zinc-900">
              {area.id === "etc"
                ? "거주 주소를 검색해 주세요"
                : "거주 건물을 등록하면 매칭이 쉬워져요."}
            </h2>
          </div>

          {/* 사전 등록된 건물 옵션 — 기타는 비어 있어서 자동 스킵 */}
          {area.buildings.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={busy}
              onClick={() => applyLocation(b.name, b.address, b.lat, b.lng)}
              className={cn(
                "flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition active:bg-zinc-50",
                busy && "opacity-60",
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[18px]">
                🏢
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-zinc-900">{b.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                  {b.address}
                </p>
              </div>
              <span className="text-zinc-300">›</span>
            </button>
          ))}

          {/* 직접 검색 UI — 신림/강남에서는 사전 목록 아래에 보조 옵션으로, 기타에서는 단독 노출 */}
          <SearchPicker
            heading={area.id === "etc" ? null : "직접 등록하기"}
            busy={busy}
            onPick={(r) => applyLocation(r.name, r.address, r.lat, r.lng)}
          />

          {error && (
            <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
              {error}
            </p>
          )}
        </div>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────
// SearchPicker — Kakao Places 키워드 검색(디바운스 300ms). 결과 탭 → onPick.
// 옛 AddressOnboardingClient의 검색 부분을 떼와 단순화한 컴포넌트.
// ─────────────────────────────────────────────────────

type SearchResult = { name: string; address: string; lat: number; lng: number };

function SearchPicker({
  heading,
  busy,
  onPick,
}: {
  heading: string | null;
  busy: boolean;
  onPick: (r: SearchResult) => void;
}) {
  const sdk = useKakaoSdk();
  const ready = sdk.status === "ready";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || !window.kakao?.maps?.services) return;
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
  }, [query, ready]);

  return (
    <div className="mt-1 rounded-2xl border border-zinc-200 bg-white p-3">
      {heading && (
        <p className="mb-2 text-[12px] font-semibold text-zinc-500">{heading}</p>
      )}
      <div className="relative">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M20 20l-3.2-3.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="도로명·지번·건물명으로 검색"
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-[13px] placeholder:text-zinc-400 focus:border-brand focus:outline-none"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
            검색 중…
          </span>
        )}
      </div>

      {results.length > 0 && (
        <ul className="mt-2 flex max-h-72 flex-col overflow-y-auto divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(r)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2.5 text-left transition active:bg-zinc-50",
                  busy && "opacity-60",
                )}
              >
                <span className="mt-0.5 text-[14px]">📍</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-zinc-900">
                    {r.name}
                  </span>
                  {r.address && (
                    <span className="mt-0.5 block line-clamp-1 text-[11px] text-zinc-500">
                      {r.address}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!ready && (
        <p className="mt-2 text-[11px] text-zinc-400">
          지도 SDK 로드 중…
        </p>
      )}
    </div>
  );
}
