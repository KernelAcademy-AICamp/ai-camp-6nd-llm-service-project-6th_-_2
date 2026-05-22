import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { ChatClient } from "@/components/ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: { partyId: string } }) {
  const me = await requireCurrentUser();
  const sb = getServiceClient();

  const { data: party } = await sb
    .from("parties")
    .select("id, host_id, status, store_name, representative_menu, max_participants, price_per_person, deal_at, completed_at, pickup_location_id, custom_pickup_name")
    .eq("id", params.partyId)
    .maybeSingle();
  if (!party) notFound();

  const { data: members } = await sb
    .from("party_participants")
    .select("user_id, is_host, status, profiles(nickname, level)")
    .eq("party_id", params.partyId);

  let pickupName: string | null = null;
  if (party.pickup_location_id) {
    const { data: pl } = await sb
      .from("pickup_locations")
      .select("name")
      .eq("id", party.pickup_location_id)
      .maybeSingle();
    pickupName = (pl?.name as string) ?? null;
  } else {
    pickupName = (party as any).custom_pickup_name ?? null;
  }

  const { data: receipts } = await sb
    .from("receipts")
    .select("id, final_total_amount, price_per_person, uploader_id")
    .eq("party_id", params.partyId);

  // 이 사용자가 이미 작성한 리뷰
  const { data: myReviews } = await sb
    .from("reviews")
    .select("reviewee_id, rating")
    .eq("party_id", params.partyId)
    .eq("reviewer_id", me.id);

  return (
    <ChatClient
      me={{ id: me.id, nickname: me.nickname }}
      party={{
        id: party.id as string,
        host_id: party.host_id as string,
        status: party.status as any,
        store_name: party.store_name as string,
        representative_menu: (party as any).representative_menu,
        max_participants: party.max_participants as number,
        price_per_person: party.price_per_person as number,
        deal_at: party.deal_at as string,
        pickup_name: pickupName,
        completed_at: (party as any).completed_at,
      }}
      members={(members ?? [])
        .filter((m: any) => m.status === "approved")
        .map((m: any) => ({
          user_id: m.user_id,
          is_host: m.is_host,
          nickname: m.profiles?.nickname ?? "??",
          level: m.profiles?.level ?? "dandelion",
        }))}
      hasReceipt={(receipts ?? []).length > 0}
      receiptInfo={
        receipts && receipts.length > 0
          ? {
              total_amount: receipts[0].final_total_amount as number,
              price_per_person: receipts[0].price_per_person as number,
            }
          : null
      }
      myReviewedIds={(myReviews ?? []).map((r: any) => r.reviewee_id as string)}
    />
  );
}
