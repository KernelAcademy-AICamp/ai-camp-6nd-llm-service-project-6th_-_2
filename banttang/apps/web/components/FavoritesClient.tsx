"use client";

import { useState } from "react";
import { removeStoreFavorite } from "@/app/_actions/store-favorites";
import { StoreThumb } from "./StoreThumb";
import type { StoreFavoriteKind, StoreFavoriteRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "all" | StoreFavoriteKind;

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "store", label: "가게" },
  { key: "product", label: "상품" },
];

export function FavoritesClient({ items }: { items: StoreFavoriteRow[] }) {
  const [list, setList] = useState(items);
  const [tab, setTab] = useState<Tab>("all");
  const [removing, setRemoving] = useState<string | null>(null);

  const counts = {
    all: list.length,
    store: list.filter((i) => i.kind === "store").length,
    product: list.filter((i) => i.kind === "product").length,
  };
  const visible = tab === "all" ? list : list.filter((i) => i.kind === tab);

  async function onRemove(id: string) {
    setRemoving(id);
    const res = await removeStoreFavorite(id);
    if (!res.ok) {
      setRemoving(null);
      alert(res.error);
      return;
    }
    setList((prev) => prev.filter((i) => i.id !== id));
    setRemoving(null);
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="bg-white px-5 pb-1 pt-1">
        <h1 className="text-[20px] font-extrabold tracking-tight text-zinc-900">
          찜한 가게·상품
        </h1>
      </header>

      {/* 탭 */}
      <div className="sticky top-0 z-20 flex gap-2 border-b border-zinc-100 bg-white px-5 py-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-4 py-2 text-[14px] font-semibold transition",
              tab === t.key
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-500 active:bg-zinc-50",
            )}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={cn("ml-1", tab === t.key ? "text-white/70" : "text-zinc-400")}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
          <span className="mb-3 text-5xl" aria-hidden>
            🔖
          </span>
          <p className="text-[15px] font-bold text-zinc-900">
            아직 찜한 항목이 없어요
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
            스토어에서 마음에 드는 가게·상품을
            <br />
            찜해두면 여기서 모아볼 수 있어요.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 p-4">
          {visible.map((it) => (
            <FavoriteCard
              key={it.id}
              item={it}
              removing={removing === it.id}
              onRemove={() => onRemove(it.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FavoriteCard({
  item,
  removing,
  onRemove,
}: {
  item: StoreFavoriteRow;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-stretch overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3 p-3 active:bg-zinc-50"
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-50">
          {item.image ? (
            <div
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${item.image})` }}
              aria-hidden
            />
          ) : (
            <StoreThumb storeName={item.title} menu={item.subtitle} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium",
              item.kind === "store"
                ? "bg-sky-50 text-sky-600"
                : "bg-amber-50 text-amber-600",
            )}
          >
            {item.kind === "store" ? "가게" : "상품"}
          </span>
          <h3 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-zinc-900">
            {item.title}
          </h3>
          {item.subtitle && (
            <p className="mt-0.5 line-clamp-1 text-[12px] text-zinc-500">
              {item.subtitle}
            </p>
          )}
        </div>
      </a>

      {/* 찜 해제 버튼 */}
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label="찜 해제"
        className="flex w-12 shrink-0 items-center justify-center border-l border-zinc-100 text-amber-500 active:bg-amber-50 disabled:opacity-40"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.2L6 20V5.5a1 1 0 0 1 1-1Z" />
        </svg>
      </button>
    </li>
  );
}
