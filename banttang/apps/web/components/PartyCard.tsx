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
  /** true면 우측 하단에 상태 라벨 노출 (마이페이지용). 홈 피드는 기본 false. */
  showStatus?: boolean;
  /** 카드 우상단 메뉴(미트볼 등). 마이페이지에서 PartyCardMenu 주입. */
  menu?: React.ReactNode;
};

// price_per_person이 0이면 ‘각자 주문’ 케이스로 표시 (DB에 split_mode 컬럼 없으므로 proxy)
function isIndividualOrder(party: { price_per_person: number }) {
  return party.price_per_person === 0;
}

const SPLIT_PILL = {
  single_order: "bg-orange-100 text-orange-700",
  individual: "bg-sky-100 text-sky-700",
};

export function PartyCard({
  party,
  href,
  showStatus = false,
  menu,
}: Props) {
  const individual = isIndividualOrder(party);
  const thumbPath = party.photo_paths?.[0] ?? null;

  return (
    <Link
      href={href as any}
      className="relative block rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-brand/40 hover:shadow-sm"
    >
      {/* 미트볼 등 액션 메뉴 — 카드 우상단 외곽 살짝 밖. 메뉴 내부에서 stopPropagation 처리.
          메뉴가 있을 때는 본문 우측 패딩(pr-8) 확보해서 "각자 주문" 등 배지와 겹치지 않게 함. */}
      {menu && (
        <div className="absolute right-1 top-1 z-10">{menu}</div>
      )}
      {/* 상단 — 상태 칩(좌) + 카테고리 칩(우). 마이페이지처럼 강조 필요 시 노출. */}
      {showStatus && (
        <div className={cn("mb-2 flex items-center gap-2", menu && "pr-8")}>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              displayStatusColor[party.display_status],
            )}
          >
            {displayStatusLabel[party.display_status]}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              individual ? SPLIT_PILL.individual : SPLIT_PILL.single_order,
            )}
          >
            {individual ? "🧾 각자 주문" : "🍱 1주문 나누기"}
          </span>
        </div>
      )}

      {/* 본문 — 사용자 등록 사진(or 이모지 폴백) + 텍스트 */}
      <div className={cn("flex gap-3", !showStatus && menu && "pr-8")}>
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
            {/* 홈 피드(showStatus=false) 카드에선 카테고리 칩을 우상단에 둔다 */}
            {!showStatus && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  individual ? SPLIT_PILL.individual : SPLIT_PILL.single_order,
                )}
              >
                {individual ? "🧾 각자 주문" : "🍱 1주문 나누기"}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-1 text-[11px] text-zinc-500">
            📍 {party.pickup_name ?? "미정"}
          </p>
          {/* 반띵 시간 — showStatus(마이페이지/채팅 목록)일 땐 크게 강조. 홈 피드는 작게. */}
          {showStatus ? (
            <p className="mt-0.5 truncate text-[15px] font-bold tracking-tight text-zinc-900">
              🗓️ {formatKstFriendly(party.deal_at)}
            </p>
          ) : (
            <p className="line-clamp-1 text-[11px] text-zinc-500">
              🕒 {formatKstShort(party.deal_at)}
            </p>
          )}
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
