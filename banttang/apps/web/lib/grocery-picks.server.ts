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

// 시드 소스 — 그룹별 스토어(네이버 쇼핑) 검색어. 검색어당 첫 유효 상품 1개씩 채택.
// 후보를 충분히 둬서 일부 검색이 실패해도 그룹당 2~4개는 남도록 함.
const SEED_QUERIES: { group: PickGroup; queries: string[] }[] = [
  {
    group: "health",
    queries: [
      "닭가슴살",
      "샐러드",
      "다이어트 도시락",
      "프로틴 쉐이크",
      "단백질 바",
      "닭가슴살 소시지",
    ],
  },
  {
    group: "fruitegg",
    queries: [
      "사과",
      "복숭아",
      "계란 한판",
      "샤인머스캣",
      "방울토마토",
      "바나나",
    ],
  },
  {
    group: "homecare",
    queries: [
      "롤화장지",
      "세탁세제",
      "생수 2L",
      "주방세제",
      "섬유유연제",
      "물티슈",
    ],
  },
];

// 그룹당 시드 목표 개수 (최소 2개 보장 + 최대 4개까지 노출)
const TARGET_PER_GROUP = 4;
const MIN_PER_GROUP = 2;

export type SeedProduct = {
  group: PickGroup;
  title: string;
  pricePerPerson: number; // 상품가를 2명 기준 1인 가격으로 (100원 단위)
  image: string; // 네이버 상품 이미지 URL (그대로 사용)
};

function perPersonPrice(lowPrice: number): number {
  return Math.max(1000, Math.round(lowPrice / AI_PICK_MAX_MEMBERS / 100) * 100);
}

// 네이버 미설정·응답 부족 시 사용하는 정적 폴백.
// 이미지는 외부 도메인 화이트리스트 이슈를 피하려고 placehold.co 사용.
// 시드 함수가 그룹별로 부족분만큼 폴백에서 보충한다.
const FALLBACK_PRODUCTS: SeedProduct[] = [
  // 건강식품
  { group: "health", title: "허닭 닭가슴살 60팩 묶음", pricePerPerson: 12000, image: "https://placehold.co/240x240/7fb069/ffffff?text=%F0%9F%8D%97" },
  { group: "health", title: "샐러디 정기 패키지 5팩", pricePerPerson: 14500, image: "https://placehold.co/240x240/7fb069/ffffff?text=%F0%9F%A5%97" },
  { group: "health", title: "오뚜기맘마 다이어트 도시락 10식", pricePerPerson: 18000, image: "https://placehold.co/240x240/7fb069/ffffff?text=%F0%9F%8D%B1" },
  { group: "health", title: "단백질 쉐이크 18입 박스", pricePerPerson: 16500, image: "https://placehold.co/240x240/7fb069/ffffff?text=%F0%9F%92%AA" },
  // 과일·계란
  { group: "fruitegg", title: "동물복지 계란 30구 1판", pricePerPerson: 6500, image: "https://placehold.co/240x240/f6c244/ffffff?text=%F0%9F%A5%9A" },
  { group: "fruitegg", title: "농가직송 사과 5kg 박스", pricePerPerson: 7000, image: "https://placehold.co/240x240/f6c244/ffffff?text=%F0%9F%8D%8E" },
  { group: "fruitegg", title: "설향 딸기 4팩", pricePerPerson: 8500, image: "https://placehold.co/240x240/f6c244/ffffff?text=%F0%9F%8D%93" },
  { group: "fruitegg", title: "샤인머스캣 2kg", pricePerPerson: 11000, image: "https://placehold.co/240x240/f6c244/ffffff?text=%F0%9F%8D%87" },
  // 1인 홈케어 공구
  { group: "homecare", title: "코코 화장지 30롤", pricePerPerson: 9500, image: "https://placehold.co/240x240/64748b/ffffff?text=%F0%9F%A7%BB" },
  { group: "homecare", title: "테크 세탁세제 4L", pricePerPerson: 10500, image: "https://placehold.co/240x240/64748b/ffffff?text=%F0%9F%A7%BA" },
  { group: "homecare", title: "백산수 2L x 12병", pricePerPerson: 7500, image: "https://placehold.co/240x240/64748b/ffffff?text=%F0%9F%92%A7" },
  { group: "homecare", title: "퐁퐁 주방세제 1.5L 리필", pricePerPerson: 6800, image: "https://placehold.co/240x240/64748b/ffffff?text=%F0%9F%A7%BC" },
];

// 시드용 — 스토어(네이버 쇼핑)에서 카테고리 상품을 실제로 가져온다.
// 그룹당 TARGET_PER_GROUP개 도달하면 그 그룹은 스킵. 부족하면 FALLBACK으로 보충.
export async function getSeedProducts(): Promise<SeedProduct[]> {
  const seen = new Set<string>();
  const naverPicks: SeedProduct[] = [];
  const EXCLUDE = /정기배송|구독|렌탈|체험|샘플/;

  if (isNaverConfigured()) {
    for (const g of SEED_QUERIES) {
      let countForGroup = 0;
      for (const q of g.queries) {
        if (countForGroup >= TARGET_PER_GROUP) break;
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
        countForGroup += 1;
        naverPicks.push({
          group: g.group,
          title: pick.title,
          pricePerPerson: perPersonPrice(pick.low_price),
          image: pick.image,
        });
      }
    }
  }

  // 그룹별 부족분 보충: 네이버 결과가 MIN 미만이면 폴백으로 채우고, TARGET까지 가능한 만큼 채움.
  const result: SeedProduct[] = [];
  for (const g of SEED_QUERIES) {
    const fromNaver = naverPicks.filter((p) => p.group === g.group);
    result.push(...fromNaver);
    const need = Math.max(MIN_PER_GROUP - fromNaver.length, 0);
    const filler = FALLBACK_PRODUCTS.filter(
      (p) => p.group === g.group && !seen.has(p.title),
    ).slice(0, Math.max(need, TARGET_PER_GROUP - fromNaver.length));
    for (const f of filler) {
      seen.add(f.title);
      result.push(f);
    }
  }
  return result;
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
