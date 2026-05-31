"use client";

// 주문 수정 — 작성 시(HostNewClient)와 동일한 UX로 모든 필드 편집.
// 편집 가능: 사진 / 가게 / 메뉴 / 금액 / 인원 / 시간 / 성별 / 반띵 장소.
// (카테고리만 잠금 — 변경 시 채팅 로직 깨지므로)
//
// 사진 처리: 기존 사진(storage_path[]) + 신규 File[] + 삭제 큐(Set<string>).
//   제출 흐름: 1) 삭제 → 슬롯 비움  2) 업로드 → 빈 슬롯 채움  3) 본 데이터 PATCH

import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { partyPhotoUrl } from "@/lib/storage";
import { uploadPartyPhotos } from "@/app/_actions/upload-party-photos";
import { deletePartyPhoto } from "@/app/_actions/delete-party-photo";
import {
  PickupMap,
  PickupSearchInput,
  walkingMinutesBetween,
  type Coords,
  type Recommendation,
} from "./HostNewClient";

const MAX_PHOTOS = 10;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface InitialParty {
  id: string;
  store_name: string;
  representative_menu: string | null;
  price_per_person: number;
  deal_at: string;
  max_participants: number;
  gender_option: "all" | "same_gender";
  pickup_name: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
}

interface ExistingPhoto {
  storage_path: string;
  order_index: number;
}

export function EditPartyClient({
  party,
  existingPhotos,
  occupiedCount,
  userAddress,
  userCoords,
}: {
  party: InitialParty;
  existingPhotos: ExistingPhoto[];
  occupiedCount: number;
  userAddress: string | null;
  userCoords: Coords;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 본 데이터 필드
  const [storeName, setStoreName] = useState(party.store_name);
  const [menu, setMenu] = useState(party.representative_menu ?? "");
  const [price, setPrice] = useState(party.price_per_person);
  const [dealAtLocal, setDealAtLocal] = useState(() => isoToLocalInput(party.deal_at));
  // 작성 화면과 동일: 호스트 제외한 추가 인원으로 표시 (additionalNeeded). 저장 시 +1.
  const [additionalNeeded, setAdditionalNeeded] = useState(party.max_participants - 1);
  const [genderOption, setGenderOption] = useState<"all" | "same_gender">(
    party.gender_option,
  );

  // 사진
  const [existing] = useState<ExistingPhoto[]>(existingPhotos);
  const [deletedPaths, setDeletedPaths] = useState<Set<string>>(new Set());
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      newPreviews.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentRemaining = existing.filter((p) => !deletedPaths.has(p.storage_path));
  const totalPhotos = currentRemaining.length + newPhotos.length;

  function handleAddPhoto(e: ChangeEvent<HTMLInputElement>) {
    setPhotoError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!PHOTO_ACCEPTED.includes(file.type)) {
      setPhotoError("JPG, PNG, WEBP 형식만 올릴 수 있어요.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError("10MB 이하 사진으로 올려주세요.");
      return;
    }
    if (totalPhotos >= MAX_PHOTOS) {
      setPhotoError(`사진은 최대 ${MAX_PHOTOS}장까지에요.`);
      return;
    }
    setNewPhotos((prev) => [...prev, file]);
    setNewPreviews((prev) => [...prev, URL.createObjectURL(file)]);
  }

  function markExistingForDelete(path: string) {
    setDeletedPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }

  function removeNewPhoto(idx: number) {
    setNewPhotos((prev) => prev.filter((_, i) => i !== idx));
    setNewPreviews((prev) => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // 반띵 장소 — 현재 픽업을 첫 추천으로 미리 채워두고, 그 외 AI 추천 + 사용자 검색 결과를 같은 배열로 관리.
  const [recommendations, setRecommendations] = useState<Recommendation[]>(() => {
    if (party.pickup_name && party.pickup_lat !== null && party.pickup_lng !== null) {
      return [
        {
          name: party.pickup_name,
          description: "현재 설정된 장소",
          lat: party.pickup_lat,
          lng: party.pickup_lng,
          walking_minutes: walkingMinutesBetween(userCoords, {
            lat: party.pickup_lat,
            lng: party.pickup_lng,
          }),
          isUserSearched: true,
        },
      ];
    }
    return [];
  });
  const [selectedReco, setSelectedReco] = useState<number | null>(
    party.pickup_name && party.pickup_lat !== null && party.pickup_lng !== null ? 0 : null,
  );
  const [recoLoading, setRecoLoading] = useState(true);

  // 마운트 시 AI 추천 받기
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
        const aiPlaces: Recommendation[] = (j.places ?? []).map((p: any) => ({
          name: p.name,
          description: p.description,
          lat: p.lat,
          lng: p.lng,
          walking_minutes: p.walking_minutes,
        }));
        // 기존 (현재 픽업) + AI 추천 병합. 동명/근접 중복은 제외.
        setRecommendations((prev) => {
          const merged = [...prev];
          for (const p of aiPlaces) {
            const dup = merged.some(
              (m) => m.name === p.name && Math.abs(m.lat - p.lat) < 1e-5,
            );
            if (!dup) merged.push(p);
          }
          return merged;
        });
      })
      .catch(() => {})
      .finally(() => !cancelled && setRecoLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userCoords.lat, userCoords.lng]);

  async function handleSubmit() {
    setError(null);
    const sn = storeName.trim();
    if (!sn) return setError("가게명을 입력해주세요.");
    const max = additionalNeeded + 1;
    if (max < occupiedCount) {
      return setError(
        `이미 ${occupiedCount}명이 모였어요. 인원을 더 낮출 수 없어요.`,
      );
    }
    if (selectedReco === null || !recommendations[selectedReco]) {
      return setError("반띵 장소를 선택해주세요.");
    }
    const pickup = recommendations[selectedReco];

    setBusy(true);

    // 1) 사진 삭제
    for (const path of deletedPaths) {
      const r = await deletePartyPhoto(party.id, path);
      if (!r.ok) {
        setBusy(false);
        return setError(`사진 삭제 실패: ${r.error}`);
      }
    }

    // 2) 신규 사진 업로드
    if (newPhotos.length > 0) {
      const fd = new FormData();
      fd.append("party_id", party.id);
      for (const f of newPhotos) fd.append("files", f);
      const r = await uploadPartyPhotos(fd);
      if (!r.ok) {
        setBusy(false);
        return setError(`사진 업로드 실패: ${r.error}`);
      }
    }

    // 3) 본 데이터 PATCH
    const body: Record<string, unknown> = {
      store_name: sn,
      representative_menu: menu.trim() || null,
      price_per_person: price,
      deal_at: localInputToIso(dealAtLocal),
      max_participants: max,
      gender_option: genderOption,
      custom_pickup_name: pickup.name,
      custom_pickup_lat: pickup.lat,
      custom_pickup_lng: pickup.lng,
    };
    const res = await fetch(`/api/parties/${party.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(j.error ?? "수정 실패");
      return;
    }
    router.push(`/feed/${party.id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-32">
      <h1 className="text-lg font-bold">주문 수정</h1>
      <p className="text-[11px] text-zinc-500">
        모집 중인 주문에서 작성 시와 동일하게 수정할 수 있어요.
      </p>

      {/* 상품 사진 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>상품 사진 (최대 {MAX_PHOTOS}장)</Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {currentRemaining.map((p) => (
            <div
              key={p.storage_path}
              className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-black/[0.06]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={partyPhotoUrl(p.storage_path)}
                alt="기존 사진"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => markExistingForDelete(p.storage_path)}
                aria-label="사진 제거"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
          {newPreviews.map((url, idx) => (
            <div
              key={url}
              className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-brand/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="신규 사진" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeNewPhoto(idx)}
                aria-label="사진 제거"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <CloseIcon />
              </button>
              <span className="absolute bottom-1 left-1 rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-semibold text-white">
                NEW
              </span>
            </div>
          ))}
          {totalPhotos < MAX_PHOTOS && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 active:bg-zinc-100">
              <input
                type="file"
                accept={PHOTO_ACCEPTED.join(",")}
                onChange={handleAddPhoto}
                className="hidden"
              />
              <PlusIcon />
              <span className="text-[10px]">{totalPhotos}/{MAX_PHOTOS}</span>
            </label>
          )}
        </div>
        {photoError && (
          <p className="mt-2 text-[11px] text-rose-500">{photoError}</p>
        )}
      </section>

      {/* 가게 / 메뉴 / 금액 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>가게 이름</Label>
        <input
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>반띵 메뉴 (선택)</Label>
        <input
          value={menu}
          onChange={(e) => setMenu(e.target.value)}
          placeholder="예: 페퍼로니 라지"
          className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>예상 반띵 금액 (1인)</Label>
        <div className="mt-2 flex items-center gap-2">
          <input
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
            className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-right text-sm tabular-nums"
          />
          <span className="text-sm text-zinc-500">원</span>
        </div>
      </section>

      {/* 반띵 인원 — 작성 화면과 동일 UX (추가 필요 인원 표기) */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>반띵 인원</Label>
        <div className="mt-2 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => setAdditionalNeeded((n) => Math.max(1, n - 1))}
            disabled={additionalNeeded <= 1 || additionalNeeded + 1 - 1 < occupiedCount - 1}
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
            type="button"
            onClick={() => setAdditionalNeeded((n) => Math.min(3, n + 1))}
            disabled={additionalNeeded >= 3}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-xl text-zinc-500 disabled:opacity-30"
            aria-label="인원 증가"
          >
            +
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-400">
          *나를 제외하고 필요한 인원 (현재 신청자 포함 {occupiedCount}명)
        </p>
      </section>

      {/* 반띵 시간 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>반띵 시간</Label>
        <input
          type="datetime-local"
          value={dealAtLocal}
          onChange={(e) => setDealAtLocal(e.target.value)}
          className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          신청 마감은 거래 시간 1시간 전으로 자동 갱신.
        </p>
      </section>

      {/* 성별 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>성별 옵션</Label>
        <div className="mt-2 flex gap-2">
          {[
            { v: "all" as const, label: "성별 무관" },
            { v: "same_gender" as const, label: "동성만" },
          ].map((g) => (
            <button
              type="button"
              key={g.v}
              onClick={() => setGenderOption(g.v)}
              className={cn(
                "flex-1 rounded-xl border py-2.5 text-sm",
                genderOption === g.v
                  ? "border-brand bg-brand-50 font-semibold text-brand"
                  : "border-zinc-200 text-zinc-500",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </section>

      {/* 반띵 장소 — 작성 화면과 동일: 주소 / 검색 / 지도 / 추천 리스트 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Label>반띵 장소</Label>
        <p className="mt-1 text-[11px] text-zinc-500">📍 {userAddress ?? "위치 미설정"}</p>

        <PickupSearchInput
          center={userCoords}
          onSelectPlace={(place) => {
            setRecommendations((prev) => {
              const existingIdx = prev.findIndex(
                (r) => r.name === place.name && Math.abs(r.lat - place.lat) < 1e-6,
              );
              if (existingIdx >= 0) {
                setSelectedReco(existingIdx);
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

        {recommendations.some((r) => r.isUserSearched) && (
          <div className="mt-2 space-y-1">
            {recommendations.map((r, i) =>
              r.isUserSearched ? (
                <button
                  key={i}
                  type="button"
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
          {recommendations.map((r, i) =>
            r.isUserSearched ? null : (
              <button
                key={i}
                type="button"
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
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md gap-2 bg-white p-4 shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={busy}
          className="h-12 flex-1 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 active:bg-gray-200 disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className={cn(
            "h-12 flex-[2] rounded-xl text-sm font-bold transition-opacity",
            busy ? "bg-gray-200 text-gray-400" : "bg-brand text-white active:opacity-80",
          )}
        >
          {busy ? "저장 중..." : "변경 사항 저장"}
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold text-zinc-700">{children}</div>;
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

function localInputToIso(local: string): string {
  const [date, time] = local.split("T");
  return `${date}T${time}:00+09:00`;
}
