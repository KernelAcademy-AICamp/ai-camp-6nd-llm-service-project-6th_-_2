"use server";

// 중간지점 추천 — Server Action
// 흐름:
//   1) 호출자가 해당 party의 approved 멤버인지 검증
//   2) approved 멤버들의 auth.users.user_metadata.home 좌표 수집
//   3) centroid(평균 좌표) 계산
//   4) 카카오 Local API로 SW8(지하철역) / CE7(카페) / CS2(편의점) + keyword(맥도날드, 공원) 검색
//   5) 모든 후보 중 centroid에서 가장 가까운 1개 선정
//   6) chat_messages에 type='system', metadata.kind='midpoint_recommendation' 으로 게시
//      (이미 같은 metadata.kind의 메시지가 있으면 no-op — idempotent)

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthedUserId } from "@/lib/auth";

interface Home {
  user_id: string;
  nickname: string;
  lat: number;
  lng: number;
  address?: string | null;
  label?: string | null;
}

export interface MidpointRecommendation {
  place_name: string;
  category: string;            // 한국어 카테고리 (지하철역/카페/편의점/맥도날드/공원)
  category_group_code?: string;
  address: string;             // 도로명 우선
  lat: number;
  lng: number;
  distance_m: number;          // centroid에서의 거리(미터)
  centroid: { lat: number; lng: number };
  place_url?: string;
  participants: { nickname: string; address?: string | null }[];
}

interface KakaoDoc {
  place_name: string;
  category_name: string;
  category_group_code?: string;
  address_name: string;
  road_address_name?: string;
  x: string; // lng
  y: string; // lat
  distance?: string;
  place_url?: string;
}

const SEARCH_RADIUS_M = 1500;

export async function recommendMidpoint(
  partyId: string,
): Promise<
  | { ok: true; created: boolean; recommendation: MidpointRecommendation | null }
  | { ok: false; error: string }
> {
  try {
    // 1) 호출자 멤버십 검증
    const userId = await getAuthedUserId();
    if (!userId) return { ok: false, error: "로그인이 필요해요." };

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("party_participants")
      .select("id")
      .eq("party_id", partyId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (!membership) return { ok: false, error: "파티 멤버가 아니에요." };

    // 2) chat_room 존재 확인 + 이미 추천 메시지가 있는지 체크 (idempotent)
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("party_id", partyId)
      .maybeSingle();
    if (!room) return { ok: true, created: false, recommendation: null };

    const { data: existing } = await admin
      .from("chat_messages")
      .select("id, metadata")
      .eq("room_id", room.id)
      .eq("type", "system")
      .order("created_at", { ascending: false })
      .limit(50);
    const alreadyPosted = (existing ?? []).some(
      (m: any) =>
        m.metadata &&
        (m.metadata as { kind?: unknown }).kind === "midpoint_recommendation",
    );
    if (alreadyPosted) {
      return { ok: true, created: false, recommendation: null };
    }

    // 3) approved 참여자 + 닉네임
    const { data: members } = await admin
      .from("party_participants")
      .select("user_id, profile:profiles!party_participants_user_id_fkey(nickname)")
      .eq("party_id", partyId)
      .eq("status", "approved");
    if (!members || members.length < 2) {
      return { ok: true, created: false, recommendation: null };
    }

    // 4) 각 참여자의 auth.users.user_metadata.home 좌표 수집
    const homes: Home[] = [];
    for (const m of members) {
      const { data: u } = await admin.auth.admin.getUserById(m.user_id);
      const home = (u.user?.user_metadata as { home?: Home } | undefined)?.home;
      if (home && typeof home.lat === "number" && typeof home.lng === "number") {
        homes.push({
          user_id: m.user_id,
          nickname:
            (m.profile as { nickname?: string } | null)?.nickname ?? "참여자",
          lat: home.lat,
          lng: home.lng,
          address: home.address ?? null,
          label: home.label ?? null,
        });
      }
    }
    if (homes.length < 2) {
      // 좌표를 가진 사람이 1명 이하 — 추천 불가
      return { ok: true, created: false, recommendation: null };
    }

    // 5) centroid 계산 (단순 평균. 작은 동네 범위라 평면 근사로 충분)
    const centroidLat = homes.reduce((s, h) => s + h.lat, 0) / homes.length;
    const centroidLng = homes.reduce((s, h) => s + h.lng, 0) / homes.length;

    // 6) Kakao Local API 5종 검색을 병렬로
    const restKey = process.env.KAKAO_REST_API_KEY;
    if (!restKey) return { ok: false, error: "KAKAO_REST_API_KEY 미설정" };

    const queries: Array<
      | { kind: "category"; code: string; label: string }
      | { kind: "keyword"; query: string; label: string }
    > = [
      { kind: "category", code: "SW8", label: "지하철역" },
      { kind: "category", code: "CE7", label: "카페" },
      { kind: "category", code: "CS2", label: "편의점" },
      { kind: "keyword", query: "맥도날드", label: "맥도날드" },
      { kind: "keyword", query: "공원", label: "공원" },
    ];

    const results = await Promise.all(
      queries.map(async (q) => {
        const base =
          q.kind === "category"
            ? `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${q.code}`
            : `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q.query)}`;
        const url = `${base}&x=${centroidLng}&y=${centroidLat}&radius=${SEARCH_RADIUS_M}&sort=distance&size=5`;
        try {
          const res = await fetch(url, {
            headers: { Authorization: `KakaoAK ${restKey}` },
            cache: "no-store",
          });
          if (!res.ok) return { label: q.label, doc: null as KakaoDoc | null };
          const json = (await res.json()) as { documents?: KakaoDoc[] };
          return { label: q.label, doc: json.documents?.[0] ?? null };
        } catch {
          return { label: q.label, doc: null };
        }
      }),
    );

    // 7) 모든 후보 중 distance 최소인 후보 선택
    const ranked = results
      .filter((r): r is { label: string; doc: KakaoDoc } => r.doc !== null)
      .map((r) => ({
        label: r.label,
        doc: r.doc,
        d: Number(r.doc.distance ?? Number.POSITIVE_INFINITY),
      }))
      .sort((a, b) => a.d - b.d);
    if (ranked.length === 0) {
      return { ok: true, created: false, recommendation: null };
    }
    const best = ranked[0];

    const recommendation: MidpointRecommendation = {
      place_name: best.doc.place_name,
      category: best.label,
      category_group_code: best.doc.category_group_code,
      address: best.doc.road_address_name || best.doc.address_name,
      lat: Number(best.doc.y),
      lng: Number(best.doc.x),
      distance_m: best.d,
      centroid: { lat: centroidLat, lng: centroidLng },
      place_url: best.doc.place_url,
      participants: homes.map((h) => ({ nickname: h.nickname, address: h.address })),
    };

    // 8) 시스템 메시지로 게시 (호스트만 보이게 recipient='host' 표시)
    const content = `다 같이 모이기 좋은 중간 지점은 '${recommendation.place_name}'이에요. 이곳으로 반띵 장소를 변경하시겠어요?`;
    const { error: insErr } = await admin.from("chat_messages").insert({
      room_id: room.id,
      sender_id: null,
      type: "system",
      content,
      metadata: {
        kind: "midpoint_recommendation",
        recipient: "host",
        ...recommendation,
      },
    });
    if (insErr) {
      return { ok: false, error: `메시지 저장 실패: ${insErr.message}` };
    }

    return { ok: true, created: true, recommendation };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "추천 실패",
    };
  }
}
