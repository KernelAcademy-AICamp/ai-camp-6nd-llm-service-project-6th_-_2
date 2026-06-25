"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PickGroup } from "@/lib/grocery-picks";
import { formatKRW } from "@/lib/party-status";
import { cn } from "@/lib/utils";

export type PickDetail = {
  id: string;
  group: PickGroup;
  groupLabel: string;
  title: string;
  pricePerPerson: number;
  maxMembers: number;
  occupied: number;
  image: string;
  reason: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  isDemo: boolean;
};

const GROUP_EMOJI: Record<PickGroup, string> = {
  health: "🍗",
  fruitegg: "🍎",
  homecare: "🧴",
};

export function PickDetailClient({ detail }: { detail: PickDetail }) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [showNoHostModal, setShowNoHostModal] = useState(false);

  // 큐레이션 추천(잇메이트/디렉터즈/Clean&J 등 sourceUrl 박힌 데모)은 진짜 매칭 흐름.
  // 그 외 데모는 시드 안내만 노출(기존 동작 유지).
  const isCurated = detail.isDemo && !!detail.sourceUrl;

  function hostNew() {
    const params = new URLSearchParams({
      tab: "shopping",
      store: detail.title,
      image: detail.image,
      price: String(detail.pricePerPerson),
      // 추천 상품의 카테고리(건강식품/과일·계란/홈케어)를 그대로 넘겨 파티 생성 시
      // parties.pick_group에 박는다. 지도 핀의 카테고리 칩이 그대로 유지되도록.
      group: detail.group,
    });
    if (detail.sourceUrl) params.set("link", detail.sourceUrl);
    router.push(`/host/new?${params.toString()}` as any);
  }

  async function matchMe() {
    if (joining) return;
    if (detail.isDemo && !isCurated) {
      alert("(데모) 실제 시드된 방에서만 매칭이 가능해요.");
      return;
    }
    setJoining(true);
    try {
      // 1) 큐레이션 픽: 같은 상품으로 호스트 된 모집중 파티 검색
      if (isCurated) {
        const r = await fetch(
          `/api/parties/by-product?store=${encodeURIComponent(detail.title)}`,
        );
        const j = await r.json();
        const party = j?.party ?? null;
        if (!party) {
          // 호스트가 없으면 안내 팝업
          setJoining(false);
          setShowNoHostModal(true);
          return;
        }
        // 호스트 있음 → 자동 매칭
        await fetch(`/api/parties/${party.id}/join`, { method: "POST" });
        router.push(`/feed/${party.id}` as any);
        return;
      }
      // 2) 실제 AI 시드 방: 그 방에 바로 join
      await fetch(`/api/parties/${detail.id}/join`, { method: "POST" });
      router.push(`/feed/${detail.id}` as any);
    } catch {
      setJoining(false);
    }
  }

  const [waiting, setWaiting] = useState(false);
  async function waitForHost() {
    if (waiting) return;
    setWaiting(true);
    try {
      const r = await fetch("/api/picks/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_key: detail.title }),
      });
      const j = await r.json();
      if (!j?.ok) {
        alert(`대기 신청에 실패했어요. ${j?.error ?? ""}`);
        setWaiting(false);
        return;
      }
      setShowNoHostModal(false);
      setWaiting(false);
      alert("파티장이 등록되면 알림으로 알려드릴게요.");
    } catch {
      alert("네트워크 오류로 대기 신청에 실패했어요.");
      setWaiting(false);
    }
  }

  const slots = `${detail.occupied}/${detail.maxMembers}명`;
  const isFull = detail.occupied >= detail.maxMembers;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col bg-zinc-50 pb-24">
      {/* 자체 헤더 — UserBar는 hidden 처리됨 */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="flex-1 truncate text-center text-[16px] font-bold text-zinc-900">
          추천 상품 상세
        </h1>
        <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">
          ✨ AI BETA
        </span>
      </header>

      {/* 상품 이미지 — 가득 채운 정사각형 */}
      <div
        className="aspect-square w-full bg-zinc-100 bg-cover bg-center"
        style={{ backgroundImage: `url("${detail.image}")` }}
        role="img"
        aria-label={detail.title}
      />

      {/* 상품 기본 정보 */}
      <section className="bg-white px-4 pt-5 pb-4">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-600">
            {GROUP_EMOJI[detail.group]} {detail.groupLabel}
          </span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
            ✨ AI 추천
          </span>
        </div>
        <h2 className="mt-2 text-[18px] font-extrabold leading-snug tracking-tight text-zinc-900">
          {detail.title}
        </h2>
        <p className="mt-1.5 text-[13px] text-violet-600">{detail.reason}</p>

        {detail.sourceUrl && (
          <a
            href={detail.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 active:bg-zinc-50"
          >
            {detail.sourceLabel ?? "원본 상품 페이지"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M14 4h6v6M20 4l-8 8M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        )}
      </section>

      <div className="h-2 bg-zinc-100" />

      {/* 가격 + 그룹 정보 */}
      <section className="bg-white px-4 py-4">
        <div className="flex items-center justify-between rounded-xl bg-brand/[0.08] px-4 py-3">
          <span className="text-[13px] font-semibold text-zinc-700">
            1인 분담 금액
          </span>
          <span className="text-[20px] font-extrabold text-brand">
            {formatKRW(detail.pricePerPerson)}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-zinc-500">
          <span className="font-bold text-zinc-900">🤝 {slots}</span>
          <span>모집 중</span>
          {isFull && (
            <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600">
              마감 임박
            </span>
          )}
        </div>
      </section>

      <div className="h-2 bg-zinc-100" />

      {/* 안내 + CTA — 같은 섹션에 묶어 스크롤로 자연스럽게 노출. 고정 X. */}
      <section className="bg-white px-4 py-4">
        <h3 className="text-[14px] font-bold text-zinc-900">
          어떻게 참여하나요?
        </h3>
        <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-zinc-600">
          <p>
            <b className="text-zinc-900">파티장으로 참여하기</b> — 호스트로서 상품을 주문하고,
            내가 원하는 장소를 설정해 반띵해요.
          </p>
          <p>
            <b className="text-zinc-900">파티원으로 참여하기</b> — 주문은 호스트에게 맡기고,
            반띵 장소에서 물건만 나눠요.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={hostNew}
            className="rounded-xl bg-brand px-3 py-3 text-center active:scale-[0.98]"
          >
            <span className="block text-[14px] font-bold text-white">
              파티장으로 참여하기
            </span>
            <span className="mt-0.5 block text-[10.5px] leading-tight text-white/85">
              내가 주문 + 장소 설정
            </span>
          </button>
          <button
            type="button"
            onClick={matchMe}
            disabled={joining}
            className={cn(
              "rounded-xl border border-brand bg-white px-3 py-3 text-center active:scale-[0.98]",
              joining && "opacity-60",
            )}
          >
            <span className="block text-[14px] font-bold text-brand-dark">
              {joining ? "참여 중…" : "파티원으로 참여하기"}
            </span>
            <span className="mt-0.5 block text-[10.5px] leading-tight text-zinc-500">
              호스트에게 맡기고 장소에서 받기
            </span>
          </button>
        </div>
      </section>

      {/* 호스트 부재 안내 모달 — 큐레이션 픽에서 같은 상품 호스트 파티가 없을 때 */}
      {showNoHostModal && (
        <div
          onClick={() => setShowNoHostModal(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl"
          >
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-[28px]">
                🤝
              </div>
              <h3 className="text-[16px] font-bold leading-snug text-zinc-900">
                현재 파티장이 있는 주문이 없어요.
                <br />
                파티장으로 주문을 등록하시겠어요?
              </h3>
              <p className="mt-2 text-[12px] text-zinc-500">
                기다리시면 다른 사람이 파티장으로 등록할 때 알려드려요.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNoHostModal(false);
                  hostNew();
                }}
                className="h-12 w-full rounded-xl bg-brand text-[14px] font-bold text-white active:opacity-90"
              >
                파티장으로 주문 등록하기
              </button>
              <button
                type="button"
                onClick={waitForHost}
                disabled={waiting}
                className="h-12 w-full rounded-xl border border-brand bg-white text-[14px] font-bold text-brand-dark active:bg-brand/5 disabled:opacity-60"
              >
                {waiting ? "신청 중…" : "파티장 기다리기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
