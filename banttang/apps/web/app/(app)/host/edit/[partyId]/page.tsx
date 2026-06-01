// 주문 수정 페이지 — recruiting 상태 + 호스트만 접근.
// 작성 화면과 동일한 항목 편집 가능: 사진 / 가게명 / 메뉴 / 금액 / 인원 / 시간 / 성별 / 반띵 장소.

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ADDRESS_COOKIE, ADDRESS_COORDS_COOKIE, requireCurrentUser } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/admin";
import { EditPartyClient } from "@/components/EditPartyClient";

export const dynamic = "force-dynamic";

const FALLBACK_COORDS = { lat: 37.4842, lng: 126.9296 }; // 신림역

// PostGIS geography(Point, 4326) EWKB hex → {lng, lat}
function parseEwkbPoint(hex: string | null): { lng: number; lat: number } | null {
  if (!hex || hex.length < 50) return null;
  const buf = Buffer.from(hex, "hex");
  if (buf.length < 25) return null;
  return { lng: buf.readDoubleLE(9), lat: buf.readDoubleLE(17) };
}

export default async function EditPartyPage({
  params,
}: {
  params: { partyId: string };
}) {
  const me = await requireCurrentUser();
  const sb = getServiceClient();

  const { data } = await sb
    .from("parties")
    .select(
      "id, host_id, status, store_name, representative_menu, price_per_person, deal_at, max_participants, gender_option, custom_pickup_name, custom_pickup_point, pickup_location_id",
    )
    .eq("id", params.partyId)
    .maybeSingle();
  const party = data as
    | {
        id: string;
        host_id: string;
        status: string;
        store_name: string;
        representative_menu: string | null;
        price_per_person: number;
        deal_at: string;
        max_participants: number;
        gender_option: "all" | "same_gender";
        custom_pickup_name: string | null;
        custom_pickup_point: string | null;
        pickup_location_id: string | null;
      }
    | null;
  if (!party) notFound();
  if (party.host_id !== me.id) redirect(`/feed/${params.partyId}`);
  // 완료/취소만 잠금. 영수증 인증 후(in_progress)에도 수정 허용.
  if (
    party.status !== "recruiting" &&
    party.status !== "closed" &&
    party.status !== "in_progress"
  ) {
    redirect(`/feed/${params.partyId}`);
  }

  // 기존 사진 + 현재 점유 인원
  const [{ data: photos }, { count: occupiedCount }] = await Promise.all([
    sb
      .from("party_photos")
      .select("storage_path, order_index")
      .eq("party_id", params.partyId)
      .order("order_index", { ascending: true }),
    sb
      .from("party_participants")
      .select("id", { count: "exact", head: true })
      .eq("party_id", params.partyId)
      .in("status", ["approved", "pending"]),
  ]);

  // 현재 pickup 좌표 — pickup_location_id 우선, 없으면 custom_pickup_point.
  let pickupName: string | null = party.custom_pickup_name;
  let pickupLat: number | null = null;
  let pickupLng: number | null = null;
  if (party.pickup_location_id) {
    const { data: pl } = await sb
      .from("pickup_locations")
      .select("name, point")
      .eq("id", party.pickup_location_id)
      .maybeSingle();
    pickupName = (pl as { name?: string } | null)?.name ?? pickupName;
    const c = parseEwkbPoint((pl as { point?: string | null } | null)?.point ?? null);
    pickupLat = c?.lat ?? null;
    pickupLng = c?.lng ?? null;
  } else {
    const c = parseEwkbPoint(party.custom_pickup_point);
    pickupLat = c?.lat ?? null;
    pickupLng = c?.lng ?? null;
  }

  // 사용자 위치 (홈 주소 쿠키) — 추천 장소 호출에 사용
  const c = cookies();
  const address = c.get(ADDRESS_COOKIE)?.value ?? null;
  const coordsStr = c.get(ADDRESS_COORDS_COOKIE)?.value;
  let userCoords = FALLBACK_COORDS;
  if (coordsStr) {
    const [latS, lngS] = coordsStr.split(",");
    const lat = parseFloat(latS);
    const lng = parseFloat(lngS);
    if (!isNaN(lat) && !isNaN(lng)) userCoords = { lat, lng };
  }

  return (
    <EditPartyClient
      party={{
        id: party.id,
        store_name: party.store_name,
        representative_menu: party.representative_menu,
        price_per_person: party.price_per_person,
        deal_at: party.deal_at,
        max_participants: party.max_participants,
        gender_option: party.gender_option,
        pickup_name: pickupName,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
      }}
      existingPhotos={(photos ?? []).map((p: any) => ({
        storage_path: p.storage_path as string,
        order_index: p.order_index as number,
      }))}
      occupiedCount={occupiedCount ?? 0}
      userAddress={address}
      userCoords={userCoords}
    />
  );
}
