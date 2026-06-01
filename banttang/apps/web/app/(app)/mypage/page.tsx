import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { listParties } from "@/lib/queries";
import { MyPageTabs } from "@/components/MyPageTabs";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const me = await requireCurrentUser();
  const sb = getServiceClient();

  const hosted = await listParties({ hostId: me.id, excludeHiddenFor: me.id });
  const joined = await listParties({
    participantId: me.id,
    excludeHostedBy: me.id,
    excludeHiddenFor: me.id,
  });

  const { data: trust } = await sb
    .from("v_user_trust_stats")
    .select("*")
    .eq("id", me.id)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 신뢰점수 카드 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold">{me.nickname}</p>
          <div className="text-right text-xs">
            <p>거래 {trust?.transaction_count ?? 0}회</p>
            <p className="text-emerald-600">👍 {trust?.good_review_count ?? 0}</p>
            <p className="text-rose-600">👎 {trust?.bad_review_count ?? 0}</p>
          </div>
        </div>
      </section>

      <MyPageTabs hosted={hosted} joined={joined} />
    </div>
  );
}
