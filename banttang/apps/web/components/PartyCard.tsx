import Link from "next/link";
import { displayStatusLabel, formatKRW, formatKstShort } from "@/lib/party-status";
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
};

// price_per_person이 0이면 ‘각자 주문’ 케이스로 표시 (DB에 split_mode 컬럼 없으므로 proxy)
function isIndividualOrder(party: { price_per_person: number }) {
  return party.price_per_person === 0;
}

const SPLIT_PILL = {
  single_order: "bg-orange-100 text-orange-700",
  individual: "bg-sky-100 text-sky-700",
};

const STATUS_PILL: Record<DisplayStatus, { cls: string; icon: string }> = {
  recruiting: { cls: "text-brand", icon: "⏰" },
  waiting: { cls: "text-amber-600", icon: "⏳" },
  in_progress: { cls: "text-sky-600", icon: "💬" },
  completed: { cls: "text-zinc-400", icon: "✓" },
  cancelled: { cls: "text-rose-400", icon: "✕" },
};

export function PartyCard({ party, href, showStatus = false }: Props) {
  const individual = isIndividualOrder(party);

  return (
    <Link
      href={href as any}
      className="block rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-brand/40 hover:shadow-sm"
    >
      {/* 본문 — 이미지(or 이모지 폴백) + 텍스트 */}
      <div className="flex gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-brand-50">
          <StoreThumb storeName={party.store_name} menu={party.representative_menu} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <h3 className="truncate font-semibold leading-snug">{party.store_name}</h3>
              {/* 각자 주문은 비용 정보를 하단으로, 장보기 1주문은 링크라서 둘 다 부제에서 숨김 */}
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
          {showStatus && (
            <span className={cn("font-medium", STATUS_PILL[party.display_status].cls)}>
              {STATUS_PILL[party.display_status].icon}{" "}
              {displayStatusLabel[party.display_status]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
