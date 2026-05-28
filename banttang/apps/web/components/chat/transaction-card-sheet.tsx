"use client";

import { Sheet } from "@/components/ui/sheet";
import { formatKrw, formatKstDateTime } from "@/lib/utils";
import type { PartyWithStats } from "@/lib/types/domain";

interface Member {
  user_id: string;
  nickname: string;
  is_host: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  party: PartyWithStats;
  pickupName: string | null;
  members: Member[];
}

// 거래카드 — 채팅방에서 빠르게 거래 내용을 확인하기 위한 카드 모달.
// 현장에서 두 사람이 화면을 서로 보여줘서 거래를 시각적으로 확인하는 용도.
export function TransactionCardSheet({
  open,
  onClose,
  party,
  pickupName,
  members,
}: Props) {
  const host = members.find((m) => m.is_host);
  const others = members.filter((m) => !m.is_host);

  return (
    <Sheet open={open} onClose={onClose} maxHeightPct={85}>
      <div className="mx-auto w-full max-w-sm py-2">
        {/* 카드 본체 */}
        <article className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand/[0.12] via-white to-amber-50 p-6 shadow-lg ring-1 ring-brand/20">
          {/* 헤더 */}
          <header className="flex items-center justify-between border-b border-black/[0.06] pb-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white">
                <span className="text-[14px]">🔔</span>
              </span>
              <span className="text-[14px] font-bold text-brand">띵동 거래 카드</span>
            </div>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-black/[0.04]">
              {party.status === "completed"
                ? "완료"
                : party.status === "in_progress"
                  ? "거래 중"
                  : "거래 예정"}
            </span>
          </header>

          {/* 가게/메뉴 */}
          <section className="mt-4">
            <h2 className="text-[20px] font-bold leading-tight text-gray-900">
              🍱 {party.store_name}
            </h2>
            {party.representative_menu && (
              <p className="mt-1 text-[13px] text-gray-600">{party.representative_menu}</p>
            )}
          </section>

          <hr className="my-4 border-dashed border-black/[0.08]" />

          {/* 픽업 / 시간 / 금액 */}
          <section className="space-y-2.5 text-[13px]">
            <Row icon="📍" label="반띵 장소" value={pickupName ?? "미정"} />
            <Row icon="🕒" label="거래 시간" value={formatKstDateTime(party.deal_at)} />
            <Row
              icon="💸"
              label="1인 금액"
              value={
                party.price_per_person > 0
                  ? formatKrw(party.price_per_person)
                  : "각자 결제"
              }
            />
          </section>

          <hr className="my-4 border-dashed border-black/[0.08]" />

          {/* 멤버 */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              멤버
            </p>
            <ul className="space-y-1.5 text-[13px]">
              {host && (
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand/15 text-[11px]">
                    👑
                  </span>
                  <span className="font-medium text-gray-900">{host.nickname}</span>
                  <span className="text-[11px] text-gray-400">호스트</span>
                </li>
              )}
              {others.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[11px]">
                    🤝
                  </span>
                  <span className="text-gray-800">{m.nickname}</span>
                </li>
              ))}
            </ul>
          </section>
        </article>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-11 w-full rounded-xl bg-gray-100 text-[14px] font-semibold text-gray-700 active:bg-gray-200"
        >
          닫기
        </button>
      </div>
    </Sheet>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 w-5 text-center">{icon}</span>
      <span className="w-20 shrink-0 text-gray-500">{label}</span>
      <span className="flex-1 font-medium text-gray-900">{value}</span>
    </div>
  );
}
