import { notFound, redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { getGroupBuy } from "@/lib/groupbuy";
import { GroupBuyChatClient } from "@/components/GroupBuyChatClient";

export const dynamic = "force-dynamic";

// 공구 안내 챗봇 — 참여한 사람만 접근(참여 = 계좌 안내 대상).
export default async function GroupBuyChatPage({
  params,
}: {
  params: { slug: string };
}) {
  const me = await requireCurrentUser();
  const gb = getGroupBuy(params.slug);
  if (!gb) notFound();

  const sb = getServiceClient();
  const { data: mine } = await sb
    .from("group_buy_participants")
    .select("option_label, quantity, marked_paid_at")
    .eq("slug", gb.slug)
    .eq("user_id", me.id)
    .maybeSingle();

  // 참여 안 했으면 상세로 돌려보냄
  if (!mine) redirect(`/groupbuy/${gb.slug}`);

  const option =
    gb.options.find((o) => o.label === mine.option_label) ?? gb.options[0];

  return (
    <GroupBuyChatClient
      gb={gb}
      nickname={me.nickname}
      optionLabel={option.label}
      unitPrice={option.groupPrice}
      quantity={mine.quantity}
      alreadyPaid={!!mine.marked_paid_at}
    />
  );
}
