import "server-only";

// 홈 추천 방(AI 추천) — 시스템 호스트가 미리 만든 모집중(0/2) 방.
// 상품은 큐레이션 고정 목록. 시드는 서비스 롤로 parties에 직접 채운다.

import { getServiceClient } from "./supabase/admin";
import { isNaverConfigured, searchShop } from "./naver/client";
import type { PickGroup, PickRoom } from "./grocery-picks";

// 시드 데이터의 베타 동네(신림동) — seed.sql 고정 id.
export const SEED_NEIGHBORHOOD_ID = "00000000-0000-0000-0000-000000000001";

// 시스템 호스트(띵동 추천) 계정 — 이 이메일로 find-or-create.
export const SYSTEM_HOST_EMAIL = "ai-picks@thingdong.local";
// 닉네임 제약: ^[가-힣a-zA-Z0-9_]+$ (공백 불가, 2~10자)
export const SYSTEM_HOST_NICKNAME = "띵동추천";

// AI 추천 방 정원 (0/2명)
export const AI_PICK_MAX_MEMBERS = 2;

// 시드 소스 — 그룹별 스토어(네이버 쇼핑) 검색어. 검색어당 1개씩 가져와 그룹당 3개.
const SEED_QUERIES: { group: PickGroup; queries: string[] }[] = [
  { group: "health", queries: ["닭가슴살", "샐러드", "다이어트 도시락"] },
  { group: "fruitegg", queries: ["사과", "복숭아", "계란 한판"] },
  { group: "homecare", queries: ["롤화장지", "세탁세제", "생수 2L"] },
];

export type SeedProduct = {
  group: PickGroup;
  title: string;
  pricePerPerson: number; // 상품가를 2명 기준 1인 가격으로 (100원 단위)
  image: string; // 네이버 상품 이미지 URL (그대로 사용)
};

function perPersonPrice(lowPrice: number): number {
  return Math.max(1000, Math.round(lowPrice / AI_PICK_MAX_MEMBERS / 100) * 100);
}

// 시드용 — 스토어(네이버 쇼핑)에서 카테고리 상품을 실제로 가져온다.
// 검색어당 첫 유효 상품 1개씩 → 그룹당 최대 3개. 제목 중복은 제거.
export async function getSeedProducts(): Promise<SeedProduct[]> {
  if (!isNaverConfigured()) return [];
  const seen = new Set<string>();
  const out: SeedProduct[] = [];
  // 구독/렌탈/극단가 상품은 1인 가구 반띵에 안 맞아 제외
  const EXCLUDE = /정기배송|구독|렌탈|체험|샘플/;
  for (const g of SEED_QUERIES) {
    for (const q of g.queries) {
      const items = await searchShop(q, { display: 10, sort: "sim" }).catch(
        () => [],
      );
      const pick = items.find(
        (it) =>
          it.image &&
          it.low_price >= 6000 &&
          it.low_price <= 120000 &&
          !EXCLUDE.test(it.title) &&
          !seen.has(it.title),
      );
      if (!pick) continue;
      seen.add(pick.title);
      out.push({
        group: g.group,
        title: pick.title,
        pricePerPerson: perPersonPrice(pick.low_price),
        image: pick.image,
      });
    }
  }
  return out;
}

// 추천 섹션용 — 모집중인 AI 방 조회 (라이브, 캐시 없음: 참여 인원 즉시 반영).
export async function getAiPickRooms(): Promise<PickRoom[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("v_parties_with_stats")
    .select(
      "id, store_name, price_per_person, max_participants, deal_at, pick_group, external_image_url, status",
    )
    .eq("is_ai_pick", true)
    .eq("status", "recruiting")
    .order("created_at", { ascending: true });
  if (error) return [];
  const rows = (data ?? []) as Array<{
    id: string;
    store_name: string;
    price_per_person: number;
    max_participants: number;
    deal_at: string;
    pick_group: string | null;
    external_image_url: string | null;
  }>;
  if (rows.length === 0) return [];

  // 현재 참여 인원 (approved + pending)
  const ids = rows.map((r) => r.id);
  const { data: parts } = await sb
    .from("party_participants")
    .select("party_id, status")
    .in("party_id", ids);
  const occ = new Map<string, number>();
  for (const p of (parts ?? []) as { party_id: string; status: string }[]) {
    if (p.status === "approved" || p.status === "pending") {
      occ.set(p.party_id, (occ.get(p.party_id) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    group: (r.pick_group ?? "health") as PickGroup,
    title: r.store_name,
    pricePerPerson: r.price_per_person,
    maxMembers: r.max_participants,
    occupied: occ.get(r.id) ?? 0,
    image: r.external_image_url ?? "",
    dealAt: r.deal_at,
  }));
}
