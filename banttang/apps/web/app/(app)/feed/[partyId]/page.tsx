import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { deriveDisplayStatus } from "@/lib/party-status";
import { PartyDetailClient } from "@/components/PartyDetailClient";

// PostGIS EWKB hex → {lng, lat}
function parseEwkbPoint(hex: string | null): { lng: number; lat: number } | null {
  if (!hex || hex.length < 50) return null;
  const buf = Buffer.from(hex, "hex");
  if (buf.length < 25) return null;
  return { lng: buf.readDoubleLE(9), lat: buf.readDoubleLE(17) };
}

export const dynamic = "force-dynamic";

export default async function PartyDetailPage({ params }: { params: { partyId: string } }) {
  const me = await requireCurrentUser();
  const sb = getServiceClient();
  const { data: view } = await sb
    .from("v_parties_with_stats")
    .select("*")
    .eq("id", params.partyId)
    .maybeSingle();
  if (!view) notFound();

  const v: any = view;

  const { data: parts } = await sb
    .from("party_participants")
    .select("user_id, status, is_host, profiles(nickname, level)")
    .eq("party_id", params.partyId);

  const members = (parts ?? []) as any[];
  const occupied = members.filter((p) => p.status === "approved" || p.status === "pending").length;
  const display = deriveDisplayStatus(v.status, occupied, v.max_participants);

  let pickupName: string | null = null;
  let pickupLat: number | null = null;
  let pickupLng: number | null = null;
  if (v.pickup_location_id) {
    const { data: pl } = await sb
      .from("pickup_locations")
      .select("name, point")
      .eq("id", v.pickup_location_id)
      .maybeSingle();
    pickupName = (pl?.name as string) ?? null;
    const c = parseEwkbPoint((pl as any)?.point ?? null);
    pickupLat = c?.lat ?? null;
    pickupLng = c?.lng ?? null;
  } else {
    pickupName = v.custom_pickup_name ?? null;
    const c = parseEwkbPoint(v.custom_pickup_point ?? null);
    pickupLat = c?.lat ?? null;
    pickupLng = c?.lng ?? null;
  }

  return (
    <PartyDetailClient
      me={{ id: me.id, nickname: me.nickname }}
      party={{
        id: v.id,
        host_id: v.host_id,
        host_nickname: v.host_nickname,
        host_level: v.host_level,
        host_transaction_count: v.host_transaction_count ?? 0,
        category: v.category,
        store_name: v.store_name,
        representative_menu: v.representative_menu,
        max_participants: v.max_participants,
        price_per_person: v.price_per_person,
        deal_at: v.deal_at,
        apply_deadline_at: v.apply_deadline_at,
        pickup_location_id: v.pickup_location_id,
        custom_pickup_name: v.custom_pickup_name,
        gender_option: v.gender_option,
        status: v.status,
        approved_count: v.approved_count ?? 0,
        slots_left: v.slots_left ?? 0,
        created_at: v.created_at,
        photo_paths: v.photo_paths ?? null,
        occupied_count: occupied,
        display_status: display,
        pickup_name: pickupName,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
      }}
      members={members.map((m) => ({
        user_id: m.user_id,
        status: m.status,
        is_host: m.is_host,
        nickname: m.profiles?.nickname ?? "??",
        level: m.profiles?.level ?? "dandelion",
      }))}
    />
  );
}
