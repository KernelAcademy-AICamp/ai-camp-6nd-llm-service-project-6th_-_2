"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { useKakaoSdk } from "@/lib/use-kakao-sdk";
import { uploadPartyPhotos } from "@/app/_actions/upload-party-photos";

const MAX_PHOTOS = 10;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export type Coords = { lat: number; lng: number };
export type Recommendation = {
  name: string;
  description: string;
  lat: number;
  lng: number;
  walking_minutes: number;
  // 사용자가 직접 검색해서 추가한 항목. UI에서 검색 박스 바로 아래에 별도로 노출.
  isUserSearched?: boolean;
};

// 차트의 두 갈래: 1주문 나누기 / 각자 항목 결정하기
type SplitMode = "single_order" | "individual_items";

// 탭에 따라 같은 SplitMode라도 카피가 달라진다 (음식 ↔ 상품).
function getSplitModes(
  tab: "delivery" | "shopping",
): { v: SplitMode; title: string; emoji: string }[] {
  if (tab === "delivery") {
    return [
      { v: "single_order", title: "같은 음식 나눠요", emoji: "🍱" },
      { v: "individual_items", title: "각자 음식 담아요", emoji: "🧾" },
    ];
  }
  return [
    { v: "single_order", title: "같은 상품 나눠요", emoji: "🍱" },
    { v: "individual_items", title: "각자 상품 담아요", emoji: "🧾" },
  ];
}

function getSplitModeDesc(mode: SplitMode, tab: "delivery" | "shopping"): string {
  if (mode === "single_order") {
    return tab === "delivery"
      ? "양 많은 음식을 함께 사고 나눠요."
      : "커피, 프로틴 등 대용량 상품을 함께 사고 나눠요.";
  }
  return tab === "delivery"
    ? "각자 원하는 메뉴를 담아 주문하고 최소금액을 채워요."
    : "각자 필요한 상품을 담아 주문하고 배송비를 나눠요.";
}

export function HostNewClient({
  userAddress,
  userCoords,
  initialStoreName,
}: {
  userAddress: string | null;
  userCoords: Coords;
  // 스토어 배달 카드의 "반띵" 버튼에서 넘어올 때 가게명 프리필.
  initialStoreName?: string;
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
  const [storeName, setStoreName] = useState(initialStoreName ?? "");
  const [menu, setMenu] = useState(""); // single_order: 대표 메뉴
  const [price, setPrice] = useState(8000);
  // individual_items 전용: 최소주문금액·배송비 분담 항목
  const [hasMinOrder, setHasMinOrder] = useState(false);
  const [minOrderAmount, setMinOrderAmount] = useState(0);
  const [hasDelivery, setHasDelivery] = useState(false);
  const [deliveryAmount, setDeliveryAmount] = useState(0);

  // 상품 사진 (최대 3장). 미리보기 URL은 컴포넌트 unmount/교체 시 revoke.
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      photoPreviews.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePhotoAdd(e: ChangeEvent<HTMLInputElement>) {
    setPhotoError(null);
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 가능하도록 초기화
    if (!file) return;
    if (!PHOTO_ACCEPTED.includes(file.type)) {
      setPhotoError("JPG, PNG, WEBP 형식만 올릴 수 있어요.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError("10MB 이하 사진으로 올려주세요.");
      return;
    }
    if (photos.length >= MAX_PHOTOS) {
      setPhotoError(`사진은 최대 ${MAX_PHOTOS}장까지에요.`);
      return;
    }
    setPhotos((prev) => [...prev, file]);
    setPhotoPreviews((prev) => [...prev, URL.createObjectURL(file)]);
  }

  function handlePhotoRemove(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== idx);
    });
  }
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
    if (!res.ok) {
      setBusy(false);
      return alert(j.error ?? "실패");
    }

    // 사진 업로드 — 실패해도 파티 생성 자체는 성공이므로 alert로 알리고 진행.
    if (photos.length > 0) {
      const fd = new FormData();
      fd.append("party_id", j.id);
      for (const f of photos) fd.append("files", f);
      const up = await uploadPartyPhotos(fd);
      if (!up.ok) alert(`사진 업로드 실패: ${up.error}`);
    }

    setBusy(false);
    // ?created=1 → 상세 페이지에서 호스트한테만 "확인" 버튼을 한 번 노출.
    router.push(`/feed/${j.id}?created=1` as any);
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
          {getSplitModes(tab).map((m) => (
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
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <Label>상품 사진 (선택, 최대 {MAX_PHOTOS}장)</Label>
            <p className="mt-1 text-[11px] text-zinc-500">
              참여자에게 어떤 음식/상품인지 보여주세요.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {photoPreviews.map((url, idx) => (
                <div
                  key={url}
                  className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-black/[0.06]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`상품 사진 ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handlePhotoRemove(idx)}
                    aria-label="사진 제거"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M6 6l12 12M18 6 6 18"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 active:bg-zinc-100">
                  <input
                    type="file"
                    accept={PHOTO_ACCEPTED.join(",")}
                    onChange={handlePhotoAdd}
                    className="hidden"
                  />
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-[10px]">{photos.length}/{MAX_PHOTOS}</span>
                </label>
              )}
            </div>
            {photoError && (
              <p className="mt-2 text-[11px] text-rose-500">{photoError}</p>
            )}
          </section>

          {splitMode === "single_order" ? (
            <SingleOrderFields
              storeName={storeName}
              setStoreName={setStoreName}
              menu={menu}
              setMenu={setMenu}
              price={price}
              setPrice={setPrice}
              category={category}
              userCoords={userCoords}
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
              userCoords={userCoords}
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

            {/* 장소 직접 검색 — 추천 장소가 마음에 들지 않을 때 */}
            <PickupSearchInput
              center={userCoords}
              onSelectPlace={(place) => {
                setRecommendations((prev) => {
                  const existing = prev.findIndex(
                    (r) => r.name === place.name && Math.abs(r.lat - place.lat) < 1e-6,
                  );
                  if (existing >= 0) {
                    setSelectedReco(existing);
                    return prev;
                  }
                  const next: Recommendation = {
                    name: place.name,
                    description: place.address || "직접 검색한 장소",
                    lat: place.lat,
                    lng: place.lng,
                    walking_minutes: walkingMinutesBetween(userCoords, place),
                    isUserSearched: true,
                  };
                  const arr = [...prev, next];
                  setSelectedReco(arr.length - 1);
                  return arr;
                });
              }}
            />

            {/* 검색해서 추가한 장소 — 검색 박스 바로 아래에 즉시 노출 */}
            {recommendations.some((r) => r.isUserSearched) && (
              <div className="mt-2 space-y-1">
                {recommendations.map((r, i) =>
                  r.isUserSearched ? (
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
                  ) : null,
                )}
              </div>
            )}

            <PickupMap
              center={userCoords}
              pins={recommendations}
              selectedIndex={selectedReco}
              onSelect={setSelectedReco}
            />
            <p className="mt-2 text-[11px] text-zinc-500">
              *설정한 위치 주변의 안전한 거래 장소를 추천해드려요. 원하는 장소가 없으면 위에서 검색하세요.
            </p>
            <div className="mt-2 space-y-1">
              {recoLoading && (
                <p className="rounded-xl border border-dashed border-zinc-200 p-3 text-center text-xs text-zinc-400">
                  안전한 거래 장소를 찾는 중…
                </p>
              )}
              {!recoLoading && recommendations.filter((r) => !r.isUserSearched).length === 0 && (
                <p className="rounded-xl border border-dashed border-zinc-200 p-3 text-center text-xs text-zinc-400">
                  추천 장소를 불러오지 못했어요.
                </p>
              )}
              {recommendations.map((r, i) =>
                r.isUserSearched ? null : (
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
                ),
              )}
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
  userCoords: Coords;
}) {
  const { storeName, setStoreName, menu, setMenu, price, setPrice, category, userCoords } = props;
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
            centerLat={userCoords.lat}
            centerLng={userCoords.lng}
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
  userCoords: Coords;
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
    userCoords,
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
          centerLat={userCoords.lat}
          centerLng={userCoords.lng}
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

// 두 좌표 사이 도보 시간(분) 추정 — haversine 거리 * 평균 도보 속도(4 km/h ≈ 12 min/km).
export function walkingMinutesBetween(a: Coords, b: Coords): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aRad = toRad(a.lat);
  const bRad = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aRad) * Math.cos(bRad) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.max(1, Math.round(km * 12));
}

// 반띵 장소 검색 — Kakao Places keywordSearch. 사용자 위치 주변 우선.
export function PickupSearchInput({
  center,
  onSelectPlace,
}: {
  center: Coords;
  onSelectPlace: (place: { name: string; address: string; lat: number; lng: number }) => void;
}) {
  const sdk = useKakaoSdk();
  const ready = sdk.status === "ready";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ name: string; address: string; lat: number; lng: number }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
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
              lat: parseFloat(d.y),
              lng: parseFloat(d.x),
            })),
          );
        },
        // 사용자 위치 중심 반경 3km 내 우선 (사라지면 일반 검색으로 폴백됨)
        { location: new window.kakao.maps.LatLng(center.lat, center.lng), radius: 3000, sort: "distance" },
      );
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, ready, center.lat, center.lng]);

  return (
    <div className="relative mt-2">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder="장소 검색 (예: 신림역 1번 출구, 봉천 GS25)"
        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
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
                  onSelectPlace(r);
                  setQuery("");
                  setResults([]);
                  setShowDropdown(false);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-brand-50"
              >
                <div className="text-sm font-medium">📍 {r.name}</div>
                <div className="text-[11px] text-zinc-500">{r.address}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StoreNameSearchInput({
  value,
  onChange,
  onSelectPlace,
  centerLat,
  centerLng,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelectPlace: (placeName: string) => void;
  /** 사용자 위치 — Kakao keywordSearch에 location+radius로 넘겨 근처 결과 우선. */
  centerLat?: number;
  centerLng?: number;
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
      // 사용자 위치 기반 — 반경 5km(5000m) 내로 좁힘. 거리순 정렬.
      const opts: Record<string, unknown> = {
        category_group_code: "FD6", // 음식점
        size: 15,
      };
      if (
        typeof centerLat === "number" &&
        typeof centerLng === "number" &&
        window.kakao?.maps?.LatLng
      ) {
        opts.location = new window.kakao.maps.LatLng(centerLat, centerLng);
        opts.radius = 5000;
        opts.sort = window.kakao.maps.services?.SortBy?.DISTANCE;
      }
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
        opts,
      );
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, ready, centerLat, centerLng]);

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
        <div className="absolute left-0 right-0 top-full z-30 mt-1 flex max-h-64 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          <ul className="flex-1 overflow-y-auto">
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
          {/* 하단 sticky 닫기 — 선택하지 않고도 드롭다운을 닫고 폼으로 돌아갈 수 있게. */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setShowDropdown(false);
            }}
            className="shrink-0 border-t border-zinc-100 bg-zinc-50 py-2.5 text-center text-[13px] font-semibold text-zinc-600 active:bg-zinc-100"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

export function PickupMap({
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

