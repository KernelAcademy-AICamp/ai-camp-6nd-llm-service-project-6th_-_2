import Link from "next/link";
import {
  displayStatusColor,
  displayStatusLabel,
  formatKRW,
  formatKstFriendly,
  formatKstShort,
} from "@/lib/party-status";
import { partyPhotoUrl } from "@/lib/storage";
import type { DisplayStatus, PartyRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StoreThumb } from "./StoreThumb";

type Props = {
  party: PartyRow & {
    occupied_count: number;
    display_status: DisplayStatus;
    pickup_name: string | null;
  };
  href: string;
  /** true면 마이페이지 주문 목록 카드 레이아웃. 홈 피드는 기본 false. */
  showStatus?: boolean;
  /** 카드 우상단 메뉴(미트볼 등). 마이페이지에서 PartyCardMenu 주입. */
  menu?: React.ReactNode;
};

// price_per_person이 0이면 ‘각자 담기’ 케이스로 표시 (split_mode proxy)
function isIndividualOrder(party: { price_per_person: number }) {
  return party.price_per_person === 0;
}

const SPLIT_PILL = {
  single_order: "bg-orange-100 text-orange-700",
  individual: "bg-sky-100 text-sky-700",
};

function Thumb({
  thumbPath,
  storeName,
  menu,
  size,
}: {
  thumbPath: string | null;
  storeName: string;
  menu: string | null;
  size: string;
}) {
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-2xl bg-zinc-100", size)}>
      {thumbPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={partyPhotoUrl(thumbPath)}
          alt={storeName}
          className="h-full w-full object-cover"
        />
      ) : (
        <StoreThumb storeName={storeName} menu={menu} />
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PartyCard({ party, href, showStatus = false, menu }: Props) {
  const individual = isIndividualOrder(party);
  const thumbPath = party.photo_paths?.[0] ?? null;

  // ── 마이페이지 주문 목록 카드 (레퍼런스 레이아웃) ──
  if (showStatus) {
    const full = party.occupied_count >= party.max_participants;
    return (
      <Link
        href={href as any}
        className="relative block rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition active:bg-zinc-50"
      >
        {menu && <div className="absolute right-1.5 top-2.5 z-10">{menu}</div>}

        {/* 상단: 상태 + 나눔 방식 */}
        <div className={cn("mb-3 flex items-center gap-2", menu && "pr-8")}>
          <span
            className={cn(
              "rounded-lg px-2.5 py-1 text-[12px] font-bold",
              displayStatusColor[party.display_status],
            )}
          >
            {displayStatusLabel[party.display_status]}
          </span>
          <span className="text-[13px] font-semibold text-zinc-500">
            {individual ? "각자 담기" : "1주문 나누기"}
          </span>
        </div>

        {/* 본문: 썸네일(텍스트 높이에 맞춘 96px 정사각) + 정보(세로 중앙 정렬) */}
        <div className="flex items-center gap-3.5">
          <Thumb
            thumbPath={thumbPath}
            storeName={party.store_name}
            menu={party.representative_menu}
            size="w-24 aspect-square"
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[17px] font-bold leading-snug text-zinc-900">
              {party.store_name}
            </h3>
            <p className="mt-1 text-[14px] text-zinc-500">
              {individual ? (
                <span className="font-semibold text-zinc-700">각자 결제</span>
              ) : (
                <>1인 {formatKRW(party.price_per_person)}</>
              )}
              <span className="px-1 text-zinc-300">·</span>
              <span className={cn("font-bold", full ? "text-emerald-600" : "text-zinc-600")}>
                {party.occupied_count}/{party.max_participants}명
              </span>
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-[13px] font-medium leading-none text-zinc-600">
              <span className="relative top-[-1px] flex shrink-0">
                <CalendarIcon />
              </span>
              <span className="leading-none">{formatKstFriendly(party.deal_at)}</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // ── 홈 피드 카드 (기존 레이아웃) ──
  return (
    <Link
      href={href as any}
      className="relative block rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-brand/40 hover:shadow-sm"
    >
      {menu && <div className="absolute right-1 top-1 z-10">{menu}</div>}

      <div className={cn("flex gap-3", menu && "pr-8")}>
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-brand-50">
          {thumbPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={partyPhotoUrl(thumbPath)}
              alt={party.store_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <StoreThumb storeName={party.store_name} menu={party.representative_menu} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <h3 className="truncate font-semibold leading-snug">{party.store_name}</h3>
              {!individual && party.category === "delivery" && party.representative_menu && (
                <span className="truncate text-xs text-zinc-500">{party.representative_menu}</span>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                individual ? SPLIT_PILL.individual : SPLIT_PILL.single_order,
              )}
            >
              {individual ? "🧾 각자 주문" : "🍱 1주문 나누기"}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-[11px] text-zinc-500">
            📍 {party.pickup_name ?? "미정"}
          </p>
          <p className="line-clamp-1 text-[11px] text-zinc-500">
            🕒 {formatKstShort(party.deal_at)}
          </p>
        </div>
      </div>

      <hr className="my-3 border-zinc-100" />

      <div className="flex items-center justify-between text-xs">
        <div className="min-w-0 flex-1 pr-2">
          {individual ? (
            <span className="line-clamp-1 font-medium text-zinc-700">
              🛵 {party.representative_menu || "각자 결제"}
            </span>
          ) : (
            <span className="line-clamp-1 font-medium text-zinc-700">
              💸 예상 1인 {formatKRW(party.price_per_person)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">{party.max_participants - 1}명</span>
        </div>
      </div>
    </Link>
  );
}
