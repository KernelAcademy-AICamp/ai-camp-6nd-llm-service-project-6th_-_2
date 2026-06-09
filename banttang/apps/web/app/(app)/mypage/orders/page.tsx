import { requireCurrentUser } from "@/lib/auth";
import { listParties } from "@/lib/queries";
import { MyPageTabs } from "@/components/MyPageTabs";

export const dynamic = "force-dynamic";

// /mypage/orders?tab=hosted|joined — 마이페이지 hub에서 진입.
export default async function MyOrdersPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const me = await requireCurrentUser();
  const hosted = await listParties({ hostId: me.id, excludeHiddenFor: me.id });
  const joined = await listParties({
    participantId: me.id,
    excludeHostedBy: me.id,
    excludeHiddenFor: me.id,
  });

  const initialTab: "hosted" | "joined" =
    searchParams?.tab === "joined" ? "joined" : "hosted";

  return (
    <div className="flex flex-col gap-4 p-4">
      <MyPageTabs hosted={hosted} joined={joined} initialTab={initialTab} />
    </div>
  );
}
