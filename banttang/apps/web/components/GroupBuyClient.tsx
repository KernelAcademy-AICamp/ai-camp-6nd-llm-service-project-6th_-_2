"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { joinGroupBuy, leaveGroupBuy } from "@/app/_actions/group-buy";
import { groupBuyDiscountRate, type GroupBuy } from "@/lib/groupbuy";
import { cn, formatKrw, formatKstDateTime } from "@/lib/utils";
import { FruitBoxArt } from "./FruitBoxArt";

export function GroupBuyClient({
  gb,
  participantCount,
  totalQuantity,
  myParticipation,
}: {
  gb: GroupBuy;
  participantCount: number;
  totalQuantity: number;
  myParticipation: { optionLabel: string; quantity: number } | null;
}) {
  const router = useRouter();

  const initialOptIdx = Math.max(
    0,
    gb.options.findIndex((o) => o.label === myParticipation?.optionLabel),
  );
  const [optIdx, setOptIdx] = useState(initialOptIdx);
  const [qty, setQty] = useState(myParticipation?.quantity ?? 1);
  const [busy, setBusy] = useState(false);

  const opt = gb.options[optIdx];
  const discount = groupBuyDiscountRate(opt);

  const deadlineMs = new Date(gb.deadlineAt).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const closed = now !== null && deadlineMs < now;
  const remainLabel = useMemo(() => {
    if (now === null) return null;
    const diff = deadlineMs - now;
    if (diff <= 0) return "마감";
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    if (d > 0) return `D-${d}`;
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}시간 ${m}분 남음`;
  }, [now, deadlineMs]);

  const progress = Math.min(
    100,
    Math.round((participantCount / gb.targetCount) * 100),
  );

  const joined = !!myParticipation;
  const changed =
    joined &&
    (myParticipation!.optionLabel !== opt.label ||
      myParticipation!.quantity !== qty);

  async function onJoin() {
    if (busy || closed) return;
    setBusy(true);
    const res = await joinGroupBuy({
      slug: gb.slug,
      optionLabel: opt.label,
      quantity: qty,
    });
    setBusy(false);
    if (!res.ok) return alert(res.error);
    // 참여 즉시 안내 챗봇으로 → 계좌번호 안내
    router.push(`/groupbuy/${gb.slug}/chat` as any);
  }

  async function onLeave() {
    if (busy) return;
    if (!confirm("공구 참여를 취소할까요?")) return;
    setBusy(true);
    const res = await leaveGroupBuy(gb.slug);
    setBusy(false);
    if (!res.ok) return alert(res.error);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-zinc-100 px-2 py-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-[15px] font-bold text-zinc-900">공동구매</h1>
        <span className="w-11" />
      </header>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto">
        {/* 히어로 — 신비복숭아는 실제 상품 사진, 그 외는 자체 일러스트 */}
        <div className="relative h-60 w-full overflow-hidden bg-gradient-to-br from-rose-50 to-pink-100">
          {gb.slug === "sinbi-peach" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/images/peach_photo_crop.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
          ) : (
            <FruitBoxArt className="absolute inset-0 h-full w-full" />
          )}
          <span className="absolute left-4 top-4 rounded-full bg-brand px-3 py-1.5 text-[12px] font-bold text-white shadow">
            띵동 공구
          </span>
          {remainLabel && (
            <span
              className={cn(
                "absolute right-4 top-4 rounded-full px-3 py-1.5 text-[12px] font-bold shadow",
                closed ? "bg-zinc-700 text-white" : "bg-rose-500 text-white",
              )}
            >
              {closed ? "마감" : `⏰ ${remainLabel}`}
            </span>
          )}
        </div>

        {/* 타이틀 / 가격 */}
        <div className="px-5 pt-4">
          <p className="text-[12px] font-semibold text-brand-dark">{gb.origin}</p>
          <h2 className="mt-1 text-[20px] font-extrabold leading-snug text-zinc-900">
            {gb.title}
          </h2>
          <p className="mt-1 text-[14px] text-zinc-500">{gb.subtitle}</p>

          <div className="mt-3 flex items-end gap-2">
            {discount > 0 && (
              <span className="text-[20px] font-extrabold text-rose-500">
                {discount}%
              </span>
            )}
            <span className="text-[22px] font-extrabold text-zinc-900">
              {formatKrw(opt.groupPrice)}
            </span>
            {opt.retailPrice > opt.groupPrice && (
              <span className="pb-0.5 text-[14px] text-zinc-400 line-through">
                {formatKrw(opt.retailPrice)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-zinc-400">{gb.unitNote}</p>
        </div>

        {/* 참여 현황 */}
        <div className="mx-5 mt-4 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-bold text-zinc-800">
              <span className="text-brand">{participantCount}명</span> 참여 중
            </span>
            <span className="text-zinc-400">목표 {gb.targetCount}명</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[12px] text-zinc-500">
            <span>신청 수량 {totalQuantity}개</span>
            <span>신청 마감 {formatKstDateTime(gb.deadlineAt)}</span>
          </div>
        </div>

        {/* 옵션 선택 */}
        <div className="px-5 pt-5">
          <p className="mb-2 text-[14px] font-bold text-zinc-800">옵션 선택</p>
          <div className="flex flex-col gap-2">
            {gb.options.map((o, i) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setOptIdx(i)}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3 text-left transition",
                  i === optIdx
                    ? "border-brand bg-brand-50"
                    : "border-zinc-200 bg-white active:bg-zinc-50",
                )}
              >
                <span className="text-[14px] font-semibold text-zinc-800">
                  {o.label}
                </span>
                <span className="text-[14px] font-bold text-zinc-900">
                  {formatKrw(o.groupPrice)}
                </span>
              </button>
            ))}
          </div>

          {/* 수량 */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[14px] font-bold text-zinc-800">수량</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-[18px] text-zinc-600 active:bg-zinc-100"
                aria-label="수량 감소"
              >
                −
              </button>
              <span className="w-8 text-center text-[16px] font-bold text-zinc-900">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-[18px] text-zinc-600 active:bg-zinc-100"
                aria-label="수량 증가"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* 포인트 */}
        <div className="mt-5 border-t-8 border-zinc-50 px-5 pt-5">
          <h3 className="text-[15px] font-bold text-zinc-900">이런 점이 좋아요</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {gb.highlights.map((h) => (
              <li key={h} className="flex gap-2 text-[14px] leading-relaxed text-zinc-700">
                <span className="text-brand">✓</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 상세 설명 */}
        <div className="px-5 pt-5">
          <h3 className="text-[15px] font-bold text-zinc-900">상품 안내</h3>
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.7] text-zinc-700">
            {gb.description}
          </p>
          <p className="mt-3 text-[13px] font-medium text-zinc-500">
            🚚 {gb.shipFrom}
          </p>
          <a
            href={gb.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand-dark underline underline-offset-2"
          >
            원 상품 정보 보기
          </a>
        </div>

        <div className="h-6" />
      </div>

      {/* 하단 CTA (BottomNav 위) */}
      <div className="border-t border-zinc-100 bg-white px-4 py-3">
        {joined && !changed ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/groupbuy/${gb.slug}/chat` as any)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-3.5 text-[15px] font-bold text-white active:scale-[0.99]"
            >
              💬 입금 안내 보기
            </button>
            <button
              type="button"
              onClick={onLeave}
              disabled={busy}
              className="rounded-xl border border-zinc-200 px-4 py-3.5 text-[14px] font-semibold text-zinc-500 active:bg-zinc-50 disabled:opacity-40"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            disabled={busy || closed}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-white transition active:scale-[0.99]",
              closed ? "bg-zinc-300" : "bg-brand",
            )}
          >
            {closed
              ? "신청이 마감되었어요"
              : changed
                ? `참여 수정하기 · ${formatKrw(opt.groupPrice * qty)}`
                : `공구 참여하기 · ${formatKrw(opt.groupPrice * qty)}`}
          </button>
        )}
      </div>
    </div>
  );
}
