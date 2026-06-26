import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { formatKrw, formatKstDateTime } from "@/lib/utils";
import type { PartyWithStats } from "@/lib/types/domain";
import { KakaoMiniMap } from "./kakao-mini-map";

export interface TransactionCardMember {
  user_id: string;
  nickname: string;
  is_host: boolean;
}

// 거래카드 본체(프레젠테이션) — 시트/페이지 어디서든 재사용.
export function TransactionCardView({
  party,
  pickupName,
  pickupCoord = null,
  members,
}: {
  party: PartyWithStats;
  pickupName: string | null;
  pickupCoord?: { lat: number; lng: number } | null;
  members: TransactionCardMember[];
}) {
  const host = members.find((m) => m.is_host);
  const others = members.filter((m) => !m.is_host);
  const statusLabel =
    party.status === "completed"
      ? "완료"
      : party.status === "in_progress"
        ? "거래 중"
        : "거래 예정";

  return (
    <article className="overflow-hidden rounded-3xl border border-brand/20 bg-[#F2F9EC] shadow-sm">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
            <BellIcon />
          </span>
          <span className="text-[15px] font-bold text-zinc-900">띵동 거래 카드</span>
        </div>
        <span className="rounded-full border border-brand/20 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-dark">
          {statusLabel}
        </span>
      </header>

      <hr className="border-brand/15" />

      {/* 가게/메뉴 */}
      <section className="px-5 pt-4">
        <h2 className="text-[20px] font-extrabold leading-tight tracking-tight text-zinc-900">
          {party.store_name}
        </h2>
        {party.representative_menu && (
          <p className="mt-1 text-[13px] text-zinc-500">{party.representative_menu}</p>
        )}
      </section>

      {/* 거래 정보 */}
      <section className="space-y-3 px-5 py-4 text-[14px]">
        <Row icon={<ClockIcon />} label="거래 시간" value={formatKstDateTime(party.deal_at)} />
        <Row
          icon={<WonIcon />}
          label="1인 금액"
          value={party.price_per_person > 0 ? formatKrw(party.price_per_person) : "각자 결제"}
        />
        <Row icon={<PinIcon />} label="반띵 장소" value={pickupName ?? "미정"} />
        {pickupCoord && (
          <div className="overflow-hidden rounded-xl">
            <KakaoMiniMap lat={pickupCoord.lat} lng={pickupCoord.lng} title={pickupName ?? undefined} />
          </div>
        )}
      </section>

      <hr className="border-brand/15" />

      {/* 멤버 */}
      <section className="px-5 py-4">
        <p className="mb-2.5 text-[12px] font-semibold text-zinc-400">멤버 {members.length}명</p>
        <ul className="flex flex-col gap-2.5">
          {host && (
            <li className="flex items-center gap-2">
              <Avatar nickname={host.nickname} size={26} />
              <span className="text-[14px] font-semibold text-zinc-900">{host.nickname}</span>
              <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-dark">
                호스트
              </span>
            </li>
          )}
          {others.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2">
              <Avatar nickname={m.nickname} size={26} />
              <span className="text-[14px] text-zinc-800">{m.nickname}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-zinc-400">{icon}</span>
      <span className="w-20 shrink-0 text-zinc-500">{label}</span>
      <span className="flex-1 font-semibold text-zinc-900">{value}</span>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3a5 5 0 0 0-5 5v3.5L5.5 15h13L17 11.5V8a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.8V12l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function WonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 10l1.4 4 1.6-3 1.6 3 1.4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
