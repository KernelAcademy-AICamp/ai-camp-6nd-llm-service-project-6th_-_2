// 반띵(거래) 카드 확인 페이지 — 채팅의 '내 거래 카드보기' / '반띵 카드 보기'에서 진입.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseEwkbPoint } from "@/lib/queries";
import type { PartyWithStats } from "@/lib/types/domain";
import { GuideBackButton } from "@/components/chat/guide-back-button";
import {
  TransactionCardView,
  type TransactionCardMember,
} from "@/components/chat/transaction-card-view";

export const dynamic = "force-dynamic";

export default async function TransactionCardPage({
  params,
}: {
  params: { partyId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: party } = await supabase
    .from("v_parties_with_stats")
    .select("*")
    .eq("id", params.partyId)
    .maybeSingle<PartyWithStats>();
  if (!party) notFound();

  // 픽업 장소 + 좌표
  const ext = party as PartyWithStats & {
    pickup_location_id?: string | null;
    custom_pickup_name?: string | null;
    custom_pickup_point?: string | null;
  };
  let pickupName: string | null = null;
  let pickupCoord: { lat: number; lng: number } | null = null;
  if (ext.pickup_location_id) {
    const { data } = await supabase
      .from("pickup_locations")
      .select("name, point")
      .eq("id", ext.pickup_location_id)
      .maybeSingle<{ name: string; point: string | null }>();
    pickupName = data?.name ?? null;
    pickupCoord = parseEwkbPoint(data?.point ?? null);
  } else if (ext.custom_pickup_name) {
    pickupName = ext.custom_pickup_name;
    pickupCoord = parseEwkbPoint(ext.custom_pickup_point ?? null);
  }

  // 멤버
  const { data: parts } = await supabase
    .from("party_participants")
    .select("user_id, is_host, profile:profiles!party_participants_user_id_fkey(nickname)")
    .eq("party_id", params.partyId)
    .eq("status", "approved");
  const members: TransactionCardMember[] = (
    (parts ?? []) as Array<{
      user_id: string;
      is_host: boolean;
      profile: { nickname?: string } | { nickname?: string }[] | null;
    }>
  ).map((p) => {
    const prof = Array.isArray(p.profile) ? p.profile[0] : p.profile;
    return {
      user_id: p.user_id,
      nickname: prof?.nickname ?? "알 수 없음",
      is_host: p.is_host,
    };
  });

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 p-4 pb-16">
      <div className="flex items-center gap-2 pt-1">
        <GuideBackButton />
        <h1 className="relative top-[2px] text-[22px] font-extrabold tracking-tight text-zinc-900">
          반띵 카드
        </h1>
      </div>
      <div className="mt-3">
        <TransactionCardView
          party={party}
          pickupName={pickupName}
          pickupCoord={pickupCoord}
          members={members}
        />
      </div>
    </div>
  );
}
