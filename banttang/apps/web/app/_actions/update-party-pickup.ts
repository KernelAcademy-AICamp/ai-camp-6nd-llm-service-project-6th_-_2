"use server";

// 호스트가 반띵 장소(픽업)를 변경 — server action.
// custom_pickup_name + custom_pickup_point(geography)를 갱신하고
// 채팅방에 시스템 메시지를 게시한다.
//
// RLS: parties_update_host 정책이 호스트의 UPDATE를 허용하지만,
// chat_messages 시스템 INSERT는 system_or_sender 제약 + RLS 결합이 까다로워
// admin 클라이언트로 묶어 처리.

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UpdatePartyPickupInput {
  partyId: string;
  name: string;
  lat: number;
  lng: number;
  // 픽업 마스터의 ID를 알면 같이 저장 (없으면 custom으로 처리)
  pickupLocationId?: string | null;
}

export async function updatePartyPickup(
  input: UpdatePartyPickupInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // 1) 호스트 권한 검증
    const supabase = createServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return { ok: false, error: "로그인이 필요해요." };

    const { data: party, error: partyErr } = await supabase
      .from("parties")
      .select("id, host_id")
      .eq("id", input.partyId)
      .maybeSingle();
    if (partyErr || !party) return { ok: false, error: "파티를 찾을 수 없어요." };
    if (party.host_id !== auth.user.id) {
      return { ok: false, error: "호스트만 변경할 수 있어요." };
    }

    // 2) parties UPDATE (admin: trigger/제약 우회 안전, RLS도 OK)
    const admin = createAdminClient();
    const updatePayload: Record<string, unknown> = {
      custom_pickup_name: input.name,
      // PostGIS POINT는 (lng, lat) 순서
      custom_pickup_point: `SRID=4326;POINT(${input.lng} ${input.lat})`,
      pickup_location_id: input.pickupLocationId ?? null,
    };
    const { error: upErr } = await admin
      .from("parties")
      .update(updatePayload)
      .eq("id", input.partyId);
    if (upErr) return { ok: false, error: `장소 변경 실패: ${upErr.message}` };

    // 3) (best-effort) 카카오 reverse geocode로 도로명 주소 가져오기 — 카드에 같이 노출
    let address: string | null = null;
    const restKey = process.env.KAKAO_REST_API_KEY;
    if (restKey) {
      try {
        const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${input.lng}&y=${input.lat}`;
        const res = await fetch(url, {
          headers: { Authorization: `KakaoAK ${restKey}` },
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as {
            documents?: Array<{
              road_address?: { address_name?: string };
              address?: { address_name?: string };
            }>;
          };
          const doc = json.documents?.[0];
          address = doc?.road_address?.address_name ?? doc?.address?.address_name ?? null;
        }
      } catch {
        // 주소 조회 실패는 비치명적
      }
    }

    // 4) 채팅방에 시스템 메시지
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", input.partyId)
      .maybeSingle();
    if (room) {
      await admin.from("chat_messages").insert({
        room_id: room.id,
        sender_id: null,
        type: "system",
        system_event: "pickup_location_set",
        content: `반띵 장소가 '${input.name}'(으)로 변경되었어요`,
        metadata: {
          kind: "pickup_changed",
          name: input.name,
          lat: input.lat,
          lng: input.lng,
          address,
        },
      });

      // 5) 가장 최근 midpoint_recommendation 메시지를 'confirmed'로 마킹 → 카드의 버튼이 안 보이게.
      const { data: prevSystems } = await admin
        .from("chat_messages")
        .select("id, metadata")
        .eq("room_id", room.id)
        .eq("type", "system")
        .order("created_at", { ascending: false })
        .limit(50);
      const target = (prevSystems ?? []).find(
        (m) =>
          (m.metadata as { kind?: unknown } | null)?.kind ===
          "midpoint_recommendation",
      );
      if (target) {
        const oldMeta = (target.metadata as Record<string, unknown>) ?? {};
        await admin
          .from("chat_messages")
          .update({ metadata: { ...oldMeta, decided: "confirmed" } })
          .eq("id", target.id);
      }
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "장소 변경 중 오류가 발생했어요.",
    };
  }
}
