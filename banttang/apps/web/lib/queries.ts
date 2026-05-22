import { getServiceClient } from "./supabase/admin";
import { deriveDisplayStatus } from "./party-status";
import type { DisplayStatus, PartyRow } from "./types";

export type PartyListItem = PartyRow & {
  occupied_count: number;
  display_status: DisplayStatus;
  pickup_name: string | null;
  lng: number | null;
  lat: number | null;
};

// PostGIS geography(Point, 4326) EWKB hex → {lng, lat}
// 형식: 1바이트 byte order + 4바이트 type + 4바이트 SRID + 8바이트 X + 8바이트 Y (LE)
function parseEwkbPoint(hex: string | null): { lng: number; lat: number } | null {
  if (!hex || hex.length < 50) return null;
  const buf = Buffer.from(hex, "hex");
  if (buf.length < 25) return null;
  // 9바이트(BOM + type + SRID) 건너뛰고 X(8), Y(8)
  const lng = buf.readDoubleLE(9);
  const lat = buf.readDoubleLE(17);
  return { lng, lat };
}

export async function listParties(opts: {
  statuses?: ("recruiting" | "closed" | "in_progress" | "completed" | "cancelled")[];
  forUserGender?: "female" | "male" | "prefer_not_to_say";
  hostId?: string;
  participantId?: string;
  excludeHostedBy?: string;
  sort?: "deadline" | "latest";
}): Promise<PartyListItem[]> {
  const sb = getServiceClient();
  const sort = opts.sort ?? "deadline";
  let q = sb.from("v_parties_with_stats").select("*");
  if (sort === "latest") {
    q = q.order("created_at", { ascending: false });
  } else {
    // 마감임박순 — 신청 마감 임박 우선
    q = q.order("apply_deadline_at", { ascending: true });
  }
  if (opts.statuses?.length) q = q.in("status", opts.statuses);
  if (opts.hostId) q = q.eq("host_id", opts.hostId);

  const { data: views, error } = await q;
  if (error) throw error;
  const baseList = (views ?? []) as any[];
  if (baseList.length === 0) return [];

  // occupied count (approved + pending)
  const ids = baseList.map((v) => v.id);
  const { data: parts } = await sb
    .from("party_participants")
    .select("party_id, user_id, status")
    .in("party_id", ids);

  const occupiedMap = new Map<string, number>();
  const userPartyIds = new Set<string>();
  for (const p of parts ?? []) {
    if (p.status === "approved" || p.status === "pending") {
      occupiedMap.set(p.party_id, (occupiedMap.get(p.party_id) ?? 0) + 1);
    }
    if (opts.participantId && p.user_id === opts.participantId && p.status !== "cancelled") {
      userPartyIds.add(p.party_id);
    }
  }

  // pickup_name + 좌표
  const pickupIds = baseList.map((v) => v.pickup_location_id).filter(Boolean);
  const pickupMap = new Map<string, { name: string; lng: number | null; lat: number | null }>();
  if (pickupIds.length) {
    const { data: pickups } = await sb
      .from("pickup_locations")
      .select("id, name, point")
      .in("id", pickupIds);
    for (const p of (pickups ?? []) as any[]) {
      const coord = parseEwkbPoint(p.point);
      pickupMap.set(p.id, { name: p.name, lng: coord?.lng ?? null, lat: coord?.lat ?? null });
    }
  }

  let list = baseList.map((v) => {
    const occ = occupiedMap.get(v.id) ?? 0;
    const pickup = v.pickup_location_id ? pickupMap.get(v.pickup_location_id) : null;
    // custom_pickup_point (geography hex) 도 좌표 후보
    const customCoord = parseEwkbPoint(v.custom_pickup_point ?? null);
    return {
      ...v,
      occupied_count: occ,
      display_status: deriveDisplayStatus(v.status, occ, v.max_participants),
      pickup_name: pickup?.name ?? v.custom_pickup_name ?? null,
      lng: pickup?.lng ?? customCoord?.lng ?? null,
      lat: pickup?.lat ?? customCoord?.lat ?? null,
    } as PartyListItem;
  });

  // 성별 필터
  if (opts.forUserGender && opts.forUserGender !== "prefer_not_to_say") {
    list = list.filter((p) => {
      if (p.gender_option === "all") return true;
      // same_gender: host와 같은 성별만. host 성별 필요 → 별도 쿼리 또는 무시
      return true; // 데모 단순화: same_gender도 일단 노출. 호스트 성별 join은 생략.
    });
  }

  if (opts.participantId) {
    list = list.filter((p) => userPartyIds.has(p.id));
  }
  if (opts.excludeHostedBy) {
    list = list.filter((p) => p.host_id !== opts.excludeHostedBy);
  }

  return list;
}
