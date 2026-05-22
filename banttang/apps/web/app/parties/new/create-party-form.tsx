"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createParty, type PartyCategory } from "@/app/_actions/create-party";
import { cn, formatKrw } from "@/lib/utils";

interface PickupLocation {
  id: string;
  name: string;
  walk_minutes: number;
}

interface Props {
  pickupLocations: PickupLocation[];
}

const CATEGORIES: { key: PartyCategory; label: string; sub: string }[] = [
  { key: "delivery", label: "배달 같이", sub: "최소주문 분담" },
  { key: "offline_shopping", label: "장보기 소분", sub: "벌크 식료품 나눔" },
];

// 기본 반띵 시간 — 지금부터 2시간 후를 datetime-local 형식으로
function defaultDealAt(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  // YYYY-MM-DDTHH:mm (로컬 타임존 기준)
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreatePartyForm({ pickupLocations }: Props) {
  const router = useRouter();

  const [category, setCategory] = useState<PartyCategory>("delivery");
  const [storeName, setStoreName] = useState("");
  const [menu, setMenu] = useState("");
  const [maxParticipants, setMaxParticipants] = useState<number>(3);
  const [price, setPrice] = useState("");
  const [dealAt, setDealAt] = useState<string>(() => defaultDealAt());
  const [pickupId, setPickupId] = useState<string>("");
  const [customPickup, setCustomPickup] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = useMemo(() => Number(price.replace(/[^0-9]/g, "")), [price]);

  const canSubmit =
    storeName.trim().length > 0 &&
    priceNum > 0 &&
    !!dealAt &&
    (!!pickupId || customPickup.trim().length > 0) &&
    !submitting;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createParty({
        category,
        store_name: storeName,
        representative_menu: menu || null,
        max_participants: maxParticipants,
        price_per_person: priceNum,
        // datetime-local 은 로컬 시간 → ISO로 변환 (브라우저가 자동 시프트)
        deal_at: new Date(dealAt).toISOString(),
        pickup_location_id: pickupId || null,
        custom_pickup_name: pickupId ? null : customPickup || null,
      });
      if (!res.ok) throw new Error(res.error);
      router.push(`/parties/${res.partyId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-black/[0.06] bg-white/90 px-2 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors active:bg-black/[0.04]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="text-[16px] font-bold text-gray-900">반띵 만들기</h1>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 pb-32">
        {/* 카테고리 */}
        <section>
          <p className="mb-2 text-[13px] font-bold text-gray-900">카테고리</p>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={cn(
                  "flex flex-col items-start rounded-2xl px-4 py-3 text-left transition-colors",
                  category === c.key
                    ? "bg-brand/10 ring-2 ring-brand"
                    : "bg-gray-50 ring-1 ring-black/[0.06] active:bg-gray-100",
                )}
              >
                <span
                  className={cn(
                    "text-[14px] font-bold",
                    category === c.key ? "text-brand" : "text-gray-900",
                  )}
                >
                  {c.label}
                </span>
                <span className="text-[11px] text-gray-500">{c.sub}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 가게 / 메뉴 */}
        <section className="flex flex-col gap-3">
          <div>
            <label className="mb-2 block text-[13px] font-bold text-gray-900">
              가게 이름
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              maxLength={60}
              placeholder="예: 교촌치킨 신림점"
              className="h-12 w-full rounded-2xl bg-gray-50 px-4 text-[14px] text-gray-900 ring-1 ring-black/[0.06] outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-bold text-gray-900">
              메뉴 <span className="text-[11px] font-normal text-gray-400">(선택)</span>
            </label>
            <input
              type="text"
              value={menu}
              onChange={(e) => setMenu(e.target.value)}
              maxLength={80}
              placeholder="예: 허니콤보 + 콜라 1.25L"
              className="h-12 w-full rounded-2xl bg-gray-50 px-4 text-[14px] text-gray-900 ring-1 ring-black/[0.06] outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand/40"
            />
          </div>
        </section>

        {/* 인원 / 금액 */}
        <section className="flex flex-col gap-3">
          <div>
            <p className="mb-2 text-[13px] font-bold text-gray-900">정원</p>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxParticipants(n)}
                  className={cn(
                    "h-12 rounded-2xl text-[14px] font-bold transition-colors",
                    maxParticipants === n
                      ? "bg-brand text-white"
                      : "bg-gray-50 text-gray-700 ring-1 ring-black/[0.06] active:bg-gray-100",
                  )}
                >
                  {n}명
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-bold text-gray-900">
              1인당 금액
            </label>
            <div className="flex items-baseline gap-1 rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-black/[0.06] focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/40">
              <input
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                aria-label="1인당 금액"
                className="flex-1 bg-transparent text-right text-[20px] font-bold tabular-nums text-gray-900 outline-none placeholder:text-gray-300"
              />
              <span className="text-[15px] font-semibold text-gray-500">원</span>
            </div>
            {priceNum > 0 && (
              <p className="mt-1.5 text-[11px] text-gray-400">
                · {formatKrw(priceNum)} × {maxParticipants}명 ={" "}
                <span className="font-semibold text-gray-600">
                  {formatKrw(priceNum * maxParticipants)}
                </span>
              </p>
            )}
          </div>
        </section>

        {/* 반띵 시간 */}
        <section>
          <label className="mb-2 block text-[13px] font-bold text-gray-900">
            반띵 시간
          </label>
          <input
            type="datetime-local"
            value={dealAt}
            onChange={(e) => setDealAt(e.target.value)}
            className="h-12 w-full rounded-2xl bg-gray-50 px-4 text-[14px] text-gray-900 ring-1 ring-black/[0.06] outline-none focus:bg-white focus:ring-2 focus:ring-brand/40"
          />
          <p className="mt-1.5 text-[11px] text-gray-400">
            신청 마감은 반띵 시간 1시간 전까지로 자동 설정돼요.
          </p>
        </section>

        {/* 픽업 장소 */}
        <section>
          <p className="mb-2 text-[13px] font-bold text-gray-900">픽업 장소</p>
          {pickupLocations.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {pickupLocations.map((loc) => (
                <li key={loc.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPickupId(loc.id);
                      setCustomPickup("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors",
                      pickupId === loc.id
                        ? "bg-brand/10 ring-2 ring-brand"
                        : "bg-gray-50 ring-1 ring-black/[0.06] active:bg-gray-100",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[14px] font-semibold",
                        pickupId === loc.id ? "text-brand" : "text-gray-900",
                      )}
                    >
                      {loc.name}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      도보 {loc.walk_minutes}분
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setPickupId("")}
                  className={cn(
                    "flex w-full items-center rounded-2xl px-4 py-3 text-left text-[13px] transition-colors",
                    !pickupId
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-500 active:bg-gray-50",
                  )}
                >
                  직접 입력하기
                </button>
                {!pickupId && (
                  <input
                    type="text"
                    value={customPickup}
                    onChange={(e) => setCustomPickup(e.target.value)}
                    maxLength={60}
                    placeholder="장소 이름을 입력해주세요"
                    className="mt-1.5 h-11 w-full rounded-2xl bg-gray-50 px-4 text-[13px] text-gray-900 ring-1 ring-black/[0.06] outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand/40"
                  />
                )}
              </li>
            </ul>
          ) : (
            <input
              type="text"
              value={customPickup}
              onChange={(e) => setCustomPickup(e.target.value)}
              maxLength={60}
              placeholder="장소 이름을 입력해주세요"
              className="h-12 w-full rounded-2xl bg-gray-50 px-4 text-[14px] text-gray-900 ring-1 ring-black/[0.06] outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand/40"
            />
          )}
        </section>

        {error && (
          <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
            {error}
          </p>
        )}
      </div>

      {/* sticky 제출 */}
      <div className="sticky bottom-0 border-t border-black/[0.06] bg-white px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "h-12 w-full rounded-xl text-[15px] font-bold transition-opacity",
            canSubmit
              ? "bg-brand text-white active:opacity-80"
              : "bg-gray-200 text-gray-400",
          )}
        >
          {submitting ? "만드는 중..." : "반띵 만들기"}
        </button>
      </div>
    </form>
  );
}
