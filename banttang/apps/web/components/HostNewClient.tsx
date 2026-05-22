"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";

type Coords = { lat: number; lng: number };
type Recommendation = {
  name: string;
  description: string;
  lat: number;
  lng: number;
  walking_minutes: number;
};

// 차트의 두 갈래: 1주문 나누기 / 각자 항목 결정하기
type SplitMode = "single_order" | "individual_items";

const SPLIT_MODES: { v: SplitMode; title: string; emoji: string }[] = [
  { v: "single_order", title: "1주문 나누기", emoji: "🍱" },
  { v: "individual_items", title: "각자 항목 결정하기", emoji: "🧾" },
];

function getSplitModeDesc(mode: SplitMode, tab: "delivery" | "shopping"): string {
  if (mode === "single_order") {
    return tab === "delivery"
      ? "예: 치킨, 피자 1+1, 족발 대자 — 양 많은 음식 한 번에 사서 N등분"
      : "예: 커피 번들, 프로틴, 닭가슴살 — 양 많은 주문 한 번에 사서 N등분";
  }
  return tab === "delivery"
    ? "예: 덮밥, 중국집 각자 1그릇씩 — 최소주문금액 채우기, 배송비 N등분"
    : "예: 다이소 몰, 올리브영 — 최소주문금액 채우기, 배송비 N등분";
}

export function HostNewClient({
  userAddress,
  userCoords,
}: {
  userAddress: string | null;
  userCoords: Coords;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const defaultDealAt = (() => {
    const d = new Date(Date.now() + 90 * 60 * 1000 + 9 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  })();

  // 상단 탭: 배달 / 장보기. DB의 category enum에 매핑 (장보기→offline_shopping).
  const [tab, setTab] = useState<"delivery" | "shopping">("delivery");
  const category: "delivery" | "offline_shopping" = tab === "delivery" ? "delivery" : "offline_shopping";

  const [splitMode, setSplitMode] = useState<SplitMode | null>(null);
  const [storeName, setStoreName] = useState("");
  const [menu, setMenu] = useState(""); // single_order: 대표 메뉴
  const [price, setPrice] = useState(8000);
  // individual_items 전용: 최소주문금액·배송비 분담 항목
  const [hasMinOrder, setHasMinOrder] = useState(false);
  const [minOrderAmount, setMinOrderAmount] = useState(0);
  const [hasDelivery, setHasDelivery] = useState(false);
  const [deliveryAmount, setDeliveryAmount] = useState(0);
  // UI는 호스트 본인 제외한 "추가 필요 인원". DB max_participants = additionalNeeded + 1
  const [additionalNeeded, setAdditionalNeeded] = useState(1);
  const [dealAt, setDealAt] = useState(defaultDealAt);
  const [genderOption, setGenderOption] = useState<"all" | "same_gender">("all");

  // Claude 추천 픽업 장소
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recoLoading, setRecoLoading] = useState(true);
  const [recoFallback, setRecoFallback] = useState(false);
  const [selectedReco, setSelectedReco] = useState<number | null>(null);

  // 마운트 시 Claude로 추천 받기
  useEffect(() => {
    let cancelled = false;
    setRecoLoading(true);
    fetch("/api/recommend-places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: userCoords.lat, lng: userCoords.lng }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setRecommendations(j.places ?? []);
        setRecoFallback(!!j.fallback);
        if ((j.places ?? []).length > 0) setSelectedReco(0);
      })
      .catch(() => {})
      .finally(() => !cancelled && setRecoLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userCoords.lat, userCoords.lng]);

  // 필수 입력 모두 채워졌는지
  const isValid = (() => {
    if (!splitMode) return false;
    if (!storeName.trim()) return false;
    if (selectedReco === null || !recommendations[selectedReco]) return false;
    if (splitMode === "single_order") {
      // 장보기는 링크가 선택, 배달은 메뉴가 필수
      if (category === "delivery" && !menu.trim()) return false;
      if (price <= 0) return false;
    }
    if (splitMode === "individual_items") {
      const min = hasMinOrder && minOrderAmount > 0;
      const del = hasDelivery && deliveryAmount > 0;
      if (!min && !del) return false;
    }
    return true;
  })();

  async function submit() {
    if (!isValid) return;
    // individual_items: 선택된 항목으로 representative_menu 구성
    let individualMenu = "";
    if (splitMode === "individual_items") {
      const parts: string[] = [];
      if (hasMinOrder) parts.push(`최소주문금액 ${minOrderAmount.toLocaleString()}원`);
      if (hasDelivery) parts.push(`배송비 ${deliveryAmount.toLocaleString()}원`);
      individualMenu = parts.join(" · ");
    }

    if (selectedReco === null) return;
    setBusy(true);
    const localIso = new Date(dealAt).toISOString();
    const reco = recommendations[selectedReco];
    const payload = {
      category,
      store_name: storeName.trim(),
      representative_menu:
        splitMode === "individual_items" ? individualMenu : menu.trim() || undefined,
      max_participants: additionalNeeded + 1,
      price_per_person: splitMode === "single_order" ? price : 0,
      custom_pickup_name: reco.name,
      custom_pickup_lat: reco.lat,
      custom_pickup_lng: reco.lng,
      deal_at: localIso,
      gender_option: genderOption,
    };
    const res = await fetch("/api/parties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return alert(j.error ?? "실패");
    router.push(`/feed/${j.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-32">
      <h1 className="text-lg font-bold">반띵 주문 만들기</h1>

      {/* 상단 탭: 배달 / 장보기 */}
      <div className="flex rounded-xl bg-white p-1 shadow-sm">
        {[
          { v: "delivery", label: "🍕 배달 음식" },
          { v: "shopping", label: "🛒 장보기" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v as "delivery" | "shopping")}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium",
              tab === t.v ? "bg-brand text-white" : "text-zinc-500",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 반띵 방식 선택 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>반띵 방식</Label>
        <div className="mt-2 flex flex-col gap-2">
          {SPLIT_MODES.map((m) => (
            <button
              key={m.v}
              onClick={() => setSplitMode(m.v)}
              className={cn(
                "rounded-xl border p-3 text-left",
                splitMode === m.v ? "border-brand bg-brand-50" : "border-zinc-200",
              )}
            >
              <div className="font-medium">
                {m.emoji} {m.title}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">{getSplitModeDesc(m.v, tab)}</div>
            </button>
          ))}
        </div>
      </section>

      {/* 분기된 입력 단계 — splitMode 선택 후에만 노출 */}
      {splitMode && (
        <>
          {splitMode === "single_order" ? (
            <SingleOrderFields
              storeName={storeName}
              setStoreName={setStoreName}
              menu={menu}
              setMenu={setMenu}
              price={price}
              setPrice={setPrice}
              category={category}
            />
          ) : (
            <IndividualItemsFields
              storeName={storeName}
              setStoreName={setStoreName}
              category={category}
              hasMinOrder={hasMinOrder}
              setHasMinOrder={setHasMinOrder}
              minOrderAmount={minOrderAmount}
              setMinOrderAmount={setMinOrderAmount}
              hasDelivery={hasDelivery}
              setHasDelivery={setHasDelivery}
              deliveryAmount={deliveryAmount}
              setDeliveryAmount={setDeliveryAmount}
            />
          )}

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <Label>반띵 인원</Label>
            <div className="mt-2 flex items-center justify-center gap-6">
              <button
                onClick={() => setAdditionalNeeded((n) => Math.max(1, n - 1))}
                disabled={additionalNeeded <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-xl text-zinc-500 disabled:opacity-30"
                aria-label="인원 감소"
              >
                −
              </button>
              <div className="min-w-[3rem] text-center">
                <span className="text-2xl font-semibold text-brand">{additionalNeeded}</span>
                <span className="ml-0.5 text-sm text-zinc-500">명</span>
              </div>
              <button
                onClick={() => setAdditionalNeeded((n) => Math.min(3, n + 1))}
                disabled={additionalNeeded >= 3}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-xl text-zinc-500 disabled:opacity-30"
                aria-label="인원 증가"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-zinc-400">
              *나를 제외하고 필요한 인원
            </p>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <Label>반띵 장소</Label>
            <p className="mt-1 text-[11px] text-zinc-500">📍 {userAddress ?? "위치 미설정"}</p>
            <PickupMap
              center={userCoords}
              pins={recommendations}
              selectedIndex={selectedReco}
              onSelect={setSelectedReco}
            />
            <p className="mt-2 text-[11px] text-zinc-500">
              *설정한 위치 주변의 안전한 거래 장소를 추천해드려요.
            </p>
            <div className="mt-2 space-y-1">
              {recoLoading && (
                <p className="rounded-xl border border-dashed border-zinc-200 p-3 text-center text-xs text-zinc-400">
                  안전한 거래 장소를 찾는 중…
                </p>
              )}
              {!recoLoading && recommendations.length === 0 && (
                <p className="rounded-xl border border-dashed border-zinc-200 p-3 text-center text-xs text-zinc-400">
                  추천 장소를 불러오지 못했어요.
                </p>
              )}
              {recommendations.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedReco(i)}
                  className={cn(
                    "flex w-full items-start justify-between rounded-xl border p-2 text-left text-sm",
                    selectedReco === i ? "border-brand bg-brand-50" : "border-zinc-200",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">📍 {r.name}</span>
                    {r.description && (
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        {r.description}
                      </span>
                    )}
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-zinc-400">
                    도보 {r.walking_minutes}분
                  </span>
                </button>
              ))}
              {recoFallback && (
                <p className="text-[10px] text-zinc-400">
                  *ANTHROPIC_API_KEY 미설정 → 기본 추천 사용
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <Label>반띵 시간</Label>
            <input
              type="datetime-local"
              value={dealAt}
              onChange={(e) => setDealAt(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2"
            />
            <p className="mt-1 text-xs text-zinc-400">
              신청 마감은 거래 1시간 전으로 자동 설정됩니다.
            </p>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <Label>성별 필터링</Label>
            <div className="mt-2 flex gap-2">
              {[
                { v: "all", label: "성별 무관" },
                { v: "same_gender", label: "동성만" },
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setGenderOption(o.v as any)}
                  className={cn(
                    "flex-1 rounded-xl border py-2 text-sm",
                    genderOption === o.v
                      ? "border-brand bg-brand-50 text-brand"
                      : "border-zinc-200",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <div className="fixed bottom-16 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-zinc-200 bg-white p-3">
        <button
          onClick={submit}
          disabled={busy || !isValid}
          className="w-full rounded-xl bg-brand py-3 font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {busy ? "등록 중…" : "반띵 등록하기"}
        </button>
      </div>
    </div>
  );
}

function SingleOrderFields(props: {
  storeName: string;
  setStoreName: (v: string) => void;
  menu: string;
  setMenu: (v: string) => void;
  price: number;
  setPrice: (v: number) => void;
  category: string;
}) {
  const { storeName, setStoreName, menu, setMenu, price, setPrice, category } = props;
  const isDelivery = category === "delivery";
  return (
    <>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>{isDelivery ? "가게명" : "온라인 몰 이름 및 항목"}</Label>
        {isDelivery ? (
          <StoreNameSearchInput
            value={storeName}
            onChange={setStoreName}
            onSelectPlace={setStoreName}
          />
        ) : (
          <input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="예: 쿠팡 커피 40개 번들, 허닭 닭가슴살 60개 세트"
            className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2"
          />
        )}

        <Label className="mt-3">
          {isDelivery ? "반띵 메뉴" : "링크"}
          {!isDelivery && <span className="ml-1 text-zinc-400">(선택)</span>}
        </Label>
        <input
          value={menu}
          onChange={(e) => setMenu(e.target.value)}
          placeholder={isDelivery ? "예: 페퍼로니 L, 허니콤보" : "예: https://www.daisomall.co.kr/..."}
          className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2"
        />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>예상 반띵 금액 (1인)</Label>
        <input
          type="number"
          min={0}
          step={500}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value) || 0)}
          className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2"
        />
      </section>
    </>
  );
}

function IndividualItemsFields(props: {
  storeName: string;
  setStoreName: (v: string) => void;
  category: string;
  hasMinOrder: boolean;
  setHasMinOrder: (v: boolean) => void;
  minOrderAmount: number;
  setMinOrderAmount: (v: number) => void;
  hasDelivery: boolean;
  setHasDelivery: (v: boolean) => void;
  deliveryAmount: number;
  setDeliveryAmount: (v: number) => void;
}) {
  const {
    storeName,
    setStoreName,
    category,
    hasMinOrder,
    setHasMinOrder,
    minOrderAmount,
    setMinOrderAmount,
    hasDelivery,
    setHasDelivery,
    deliveryAmount,
    setDeliveryAmount,
  } = props;
  const isDelivery = category === "delivery";
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <Label>{isDelivery ? "가게명" : "온라인 몰 이름"}</Label>
      {isDelivery ? (
        <StoreNameSearchInput
          value={storeName}
          onChange={setStoreName}
          onSelectPlace={setStoreName}
        />
      ) : (
        <input
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="예: 다이소, 마켓컬리, 쿠팡"
          className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2"
        />
      )}

      <Label className="mt-4">반띵 항목</Label>

      <div className="mt-2 space-y-2">
        <AmountRow
          checked={hasMinOrder}
          onToggle={setHasMinOrder}
          label="최소주문금액"
          value={minOrderAmount}
          onChange={setMinOrderAmount}
          placeholder="예: 30000"
        />
        <AmountRow
          checked={hasDelivery}
          onToggle={setHasDelivery}
          label="배송비"
          value={deliveryAmount}
          onChange={setDeliveryAmount}
          placeholder="예: 3000"
        />
      </div>
    </section>
  );
}

function AmountRow({
  checked,
  onToggle,
  label,
  value,
  onChange,
  placeholder,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  label: string;
  value: number;
  onChange: (v: number) => void;
  placeholder: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border p-2",
        checked ? "border-brand bg-brand-50" : "border-zinc-200",
      )}
    >
      <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className={checked ? "font-medium" : ""}>{label}</span>
      </label>
      {checked && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            step={500}
            value={value || ""}
            onChange={(e) => onChange(Number(e.target.value) || 0)}
            placeholder={placeholder}
            className="w-28 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-right text-sm"
          />
          <span className="text-xs text-zinc-500">원</span>
        </div>
      )}
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-sm font-semibold text-zinc-700", className)}>{children}</div>;
}

function StoreNameSearchInput({
  value,
  onChange,
  onSelectPlace,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelectPlace: (placeName: string) => void;
}) {
  const sdk = useKakaoSdk();
  const ready = sdk.status === "ready";
  const [results, setResults] = useState<
    Array<{ name: string; address: string; category: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || !window.kakao?.maps?.services) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = value.trim();
    if (!q) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      setSearching(true);
      const places = new window.kakao.maps.services.Places();
      places.keywordSearch(
        q,
        (data: any[], status: any) => {
          setSearching(false);
          if (status !== window.kakao.maps.services.Status.OK) {
            setResults([]);
            return;
          }
          setResults(
            data.slice(0, 8).map((d) => ({
              name: d.place_name,
              address: d.road_address_name || d.address_name,
              category: (d.category_name as string)?.split(" > ").slice(-1)[0] ?? "",
            })),
          );
        },
        // 음식 카테고리로 좁힘 (FD6 = 음식점)
        { category_group_code: "FD6" },
      );
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, ready]);

  return (
    <div className="relative mt-2">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="가게명 검색 (예: 도미노피자 신림점)"
        className="w-full rounded-xl border border-zinc-200 px-3 py-2"
      />
      {searching && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
          검색 중…
        </span>
      )}
      {showDropdown && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
          {results.map((r, i) => (
            <li key={i} className="border-b border-zinc-100 last:border-0">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectPlace(r.name);
                  setShowDropdown(false);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-brand-50"
              >
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-[11px] text-zinc-500">
                  {r.category && <span className="mr-1">{r.category} ·</span>}
                  {r.address}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PickupMap({
  center,
  pins,
  selectedIndex,
  onSelect,
}: {
  center: Coords;
  pins: Recommendation[];
  selectedIndex: number | null;
  onSelect: (i: number) => void;
}) {
  const sdk = useKakaoSdk();
  const ready = sdk.status === "ready";
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // 지도 초기화 (내 위치 마커 1회)
  useEffect(() => {
    if (!ready || !mapEl.current || !window.kakao?.maps?.Map) return;
    const k = window.kakao;
    const map = new k.maps.Map(mapEl.current, {
      center: new k.maps.LatLng(center.lat, center.lng),
      level: 4,
    });
    mapRef.current = map;
    new k.maps.Marker({
      position: new k.maps.LatLng(center.lat, center.lng),
      map,
    });
  }, [ready, center.lat, center.lng]);

  // 추천 핀 갱신
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const k = window.kakao;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    pins.forEach((p, i) => {
      const marker = new k.maps.Marker({
        position: new k.maps.LatLng(p.lat, p.lng),
        map: mapRef.current,
        title: p.name,
      });
      k.maps.event.addListener(marker, "click", () => onSelect(i));
      markersRef.current.push(marker);
    });
    // 모든 핀 + 내 위치가 한눈에 들어오게 bounds 맞춤
    if (pins.length > 0) {
      const bounds = new k.maps.LatLngBounds();
      bounds.extend(new k.maps.LatLng(center.lat, center.lng));
      pins.forEach((p) => bounds.extend(new k.maps.LatLng(p.lat, p.lng)));
      mapRef.current.setBounds(bounds, 30, 30, 30, 30);
    }
  }, [pins, center.lat, center.lng, onSelect]);

  // 선택된 핀으로 pan + zoom
  useEffect(() => {
    if (selectedIndex === null || selectedIndex < 0) return;
    const p = pins[selectedIndex];
    const map = mapRef.current;
    if (!p || !map || !window.kakao?.maps) return;
    map.setLevel(2, { animate: true });
    map.panTo(new window.kakao.maps.LatLng(p.lat, p.lng));
  }, [selectedIndex, pins]);

  if (!ready) {
    return (
      <div className="mt-2 flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
        지도 로딩 중…
      </div>
    );
  }

  return <div ref={mapEl} className="mt-2 h-40 w-full overflow-hidden rounded-xl border border-zinc-200" />;
}

