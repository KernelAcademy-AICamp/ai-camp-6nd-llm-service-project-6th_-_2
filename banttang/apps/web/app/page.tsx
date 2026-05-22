import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ParticipantStatus, PartyWithStats } from "@/lib/types/domain";
import { formatKrw, formatKstDateTime } from "@/lib/utils";
import { PartyCardAction } from "./_components/party-card-action";
import { PendingNotificationListener } from "./_components/pending-notification-listener";
import { NotificationButton } from "./_components/notification-button";

export interface PendingItem {
  participantId: string;
  partyId: string;
  storeName: string;
  representativeMenu: string | null;
  applicantNickname: string;
  appliedAt: string | null;
}

const CATEGORY_LABEL: Record<PartyWithStats["category"], string> = {
  delivery: "배달 같이",
  offline_shopping: "장보기 소분",
  online_shopping: "온라인 공구",
};

// 홈 피드: v_parties_with_stats 뷰에서 모집중·진행중 파티 목록.
// 카드 우측에 본인 참여 여부에 맞는 액션 버튼이 붙는다.
export default async function HomePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [partiesRes, myPartsRes] = await Promise.all([
    supabase
      .from("v_parties_with_stats")
      .select(
        "id, host_id, neighborhood_id, category, store_name, representative_menu, max_participants, price_per_person, deal_at, apply_deadline_at, status, host_nickname, host_level, host_transaction_count, approved_count, slots_left",
      )
      .in("status", ["recruiting", "closed", "in_progress", "completed"])
      .order("deal_at", { ascending: true })
      .limit(20),
    user
      ? supabase
          .from("party_participants")
          .select("party_id, status")
          .eq("user_id", user.id)
      : Promise.resolve({ data: [] as { party_id: string; status: ParticipantStatus }[] }),
  ]);

  const parties = (partiesRes.data ?? []) as unknown as PartyWithStats[];
  const myStatusByParty = new Map<string, ParticipantStatus>();
  for (const row of (myPartsRes.data ?? []) as { party_id: string; status: ParticipantStatus }[]) {
    myStatusByParty.set(row.party_id, row.status);
  }

  // 호스트가 소유한 파티들의 pending 신청 카운트/디테일 — 알림함용.
  const myHostedPartyIds = user
    ? parties.filter((p) => p.host_id === user.id).map((p) => p.id)
    : [];
  const pendingByParty = new Map<string, number>();
  let pendingItems: PendingItem[] = [];
  if (myHostedPartyIds.length > 0) {
    const { data: pendingRows } = await supabase
      .from("party_participants")
      .select(
        "id, party_id, applied_at, party:parties!party_participants_party_id_fkey(store_name, representative_menu), profile:profiles!party_participants_user_id_fkey(nickname)",
      )
      .in("party_id", myHostedPartyIds)
      .eq("status", "pending")
      .order("applied_at", { ascending: false });
    const rows = (pendingRows ?? []) as unknown as Array<{
      id: string;
      party_id: string;
      applied_at: string | null;
      party: { store_name: string; representative_menu: string | null } | null;
      profile: { nickname: string } | null;
    }>;
    for (const r of rows) {
      pendingByParty.set(r.party_id, (pendingByParty.get(r.party_id) ?? 0) + 1);
      pendingItems.push({
        participantId: r.id,
        partyId: r.party_id,
        storeName: r.party?.store_name ?? "",
        representativeMenu: r.party?.representative_menu ?? null,
        applicantNickname: r.profile?.nickname ?? "참여자",
        appliedAt: r.applied_at,
      });
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-4 pb-24">
      <header className="flex items-end justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold text-brand">반띵</h1>
          <p className="text-xs text-foreground/60">
            같은 동네 1인 가구끼리 장보기·배달을 같이.
          </p>
        </div>
        {!!user && (
          <NotificationButton pendingItems={pendingItems} />
        )}
      </header>

      {!user && (
        <Link
          href="/login"
          className="flex items-center justify-between rounded-2xl bg-brand/10 px-4 py-3 ring-1 ring-brand/20 transition-colors active:bg-brand/15"
        >
          <div>
            <p className="text-[14px] font-bold text-gray-900">로그인이 필요해요</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              로그인하면 반띵에 참여하거나 직접 만들 수 있어요.
            </p>
          </div>
          <span className="rounded-full bg-brand px-3 py-1.5 text-[12px] font-bold text-white">
            로그인
          </span>
        </Link>
      )}

      {/* Realtime — 호스트의 파티에 새 pending이 들어오면 자동 새로고침 */}
      {myHostedPartyIds.length > 0 && (
        <PendingNotificationListener partyIds={myHostedPartyIds} />
      )}

      {parties.length === 0 ? (
        <p className="mt-10 text-center text-sm text-foreground/50">
          아직 모집중인 파티가 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {parties.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-foreground/10 bg-background p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] text-foreground/50">
                      {CATEGORY_LABEL[p.category]} · {statusLabel(p.status)}
                    </p>
                    {pendingByParty.get(p.id) ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                        <span className="h-1 w-1 rounded-full bg-brand" />
                        새 신청 {pendingByParty.get(p.id)}건
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm font-semibold">
                    {p.store_name}
                    {p.representative_menu && (
                      <span className="text-foreground/60">
                        {" · "}
                        {p.representative_menu}
                      </span>
                    )}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs text-foreground/70">
                    <span>
                      {p.approved_count} / {p.max_participants}명 ·{" "}
                      <span className="font-medium">{formatKrw(p.price_per_person)}</span>
                    </span>
                    <span className="text-foreground/50">
                      {formatKstDateTime(p.deal_at)}
                    </span>
                  </div>
                </div>
                <PartyCardAction
                  partyId={p.id}
                  status={p.status}
                  isHost={!!user && user.id === p.host_id}
                  myStatus={myStatusByParty.get(p.id) ?? null}
                  isLoggedIn={!!user}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* FAB — 반띵 만들기. max-w-2xl 컨테이너 우하단에 고정. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto flex max-w-2xl justify-end px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Link
            href="/parties/new"
            aria-label="반띵 만들기"
            className="pointer-events-auto inline-flex h-14 items-center gap-2 rounded-full bg-brand pl-4 pr-5 text-white shadow-lg shadow-brand/30 transition-transform active:scale-95"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[14px] font-bold">반띵 만들기</span>
          </Link>
        </div>
      </div>
    </main>
  );
}

function statusLabel(s: PartyWithStats["status"]): string {
  switch (s) {
    case "recruiting":
      return "모집 중";
    case "closed":
      return "모집 완료";
    case "in_progress":
      return "거래 중";
    case "completed":
      return "거래 완료";
    case "cancelled":
      return "취소됨";
  }
}
