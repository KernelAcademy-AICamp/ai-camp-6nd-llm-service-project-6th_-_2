import { createClient } from "@/lib/supabase/server";
import type { PartyWithStats } from "@/lib/types/domain";
import { formatKrw, formatKstDateTime } from "@/lib/utils";
import { PartyCardAction } from "./_components/party-card-action";
import { DevAccountSwitcher } from "./_components/dev-account-switcher";

const IS_DEV = process.env.NODE_ENV !== "production";

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

  const [partiesRes, myPartIdsRes] = await Promise.all([
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
          .select("party_id")
          .eq("user_id", user.id)
          .eq("status", "approved")
      : Promise.resolve({ data: [] as { party_id: string }[] }),
  ]);

  const parties = (partiesRes.data ?? []) as unknown as PartyWithStats[];
  const memberOf = new Set(
    ((myPartIdsRes.data ?? []) as { party_id: string }[]).map((r) => r.party_id),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-end justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold text-brand">반띵</h1>
          <p className="text-xs text-foreground/60">
            같은 동네 1인 가구끼리 장보기·배달을 같이.
          </p>
        </div>
      </header>

      {IS_DEV && <DevAccountSwitcher />}

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
                  <p className="text-[11px] text-foreground/50">
                    {CATEGORY_LABEL[p.category]} · {statusLabel(p.status)}
                  </p>
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
                  isMember={memberOf.has(p.id)}
                  isLoggedIn={!!user}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
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
