import Link from "next/link";
import { GROUP_BUYS, minGroupPrice } from "@/lib/groupbuy";

// 동네핫딜 칩 — 사장님이 올린 공구·핫딜 상품을 가로 스크롤 칩으로 모아 노출.
// 각 칩 클릭 시 해당 공구/핫딜 상세(/groupbuy/[slug])로 이동.
export function HotDealChips() {
  if (GROUP_BUYS.length === 0) return null;

  return (
    <section className="-mx-4">
      <div className="mb-2 flex items-center gap-1.5 px-4">
        <span aria-hidden>🔥</span>
        <h2 className="text-[15px] font-bold text-zinc-900">동네 핫딜</h2>
        <span className="text-[12px] font-medium text-zinc-400">
          사장님이 올린 공구·핫딜
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden">
        {GROUP_BUYS.map((gb) => (
          <Link
            key={gb.slug}
            href={`/groupbuy/${gb.slug}` as any}
            className="flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white py-1.5 pl-2 pr-3.5 active:bg-zinc-50"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-[18px]"
              aria-hidden
            >
              {gb.emoji}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="flex items-center gap-1">
                <span className="rounded bg-rose-500 px-1 py-px text-[9px] font-bold text-white">
                  {gb.dealType}
                </span>
                <span className="text-[13px] font-semibold text-zinc-900">
                  {gb.title}
                </span>
              </span>
              <span className="text-[12px] font-bold text-rose-500">
                {minGroupPrice(gb).toLocaleString()}원~
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
