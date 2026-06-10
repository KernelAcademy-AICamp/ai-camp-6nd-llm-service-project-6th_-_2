import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { getGroupBuy } from "@/lib/groupbuy";
import { GroupBuyClient } from "@/components/GroupBuyClient";

export const dynamic = "force-dynamic";

export default async function GroupBuyDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const me = await requireCurrentUser();
  const gb = getGroupBuy(params.slug);
  if (!gb) notFound();

  const sb = getServiceClient();
  // 전체 참여 집계 (admin → RLS 우회)
  const { data: rows } = await sb
    .from("group_buy_participants")
    .select("user_id, quantity, option_label")
    .eq("slug", gb.slug);

  const all = (rows ?? []) as Array<{
    user_id: string;
    quantity: number;
    option_label: string;
  }>;
  const participantCount = all.length;
  const totalQuantity = all.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const mine = all.find((r) => r.user_id === me.id) ?? null;

  return (
    <GroupBuyClient
      gb={gb}
      participantCount={participantCount}
      totalQuantity={totalQuantity}
      myParticipation={
        mine ? { optionLabel: mine.option_label, quantity: mine.quantity } : null
      }
    />
  );
}
