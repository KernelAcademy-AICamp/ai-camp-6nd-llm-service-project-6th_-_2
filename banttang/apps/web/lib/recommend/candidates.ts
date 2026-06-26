// AI 추천 — 후보 어셈블리 (retrieval 단계, LLM 0).
//   ① 모집중 공구(플랫폼 config + DB parties) 전량
//   ② 동네 네이버 캐시 상위 K (기존 5신호 점수로 shortlist)
// 결과를 LLM 재정렬·이유(generate.ts)의 입력으로 넘긴다.
//   docs/ai-recommendation-rag.md §2, §3

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNeighborhoodFeed } from "@/lib/naver/cache";
import { isNaverConfigured } from "@/lib/naver/client";
import { getRankingSignals } from "@/lib/naver/signals";
import { scoreCard, categoryInfoFor } from "@/lib/naver/personalize";
import { parsePriceFromSubtitle } from "@/lib/store-events";
import { GROUP_BUYS } from "@/lib/groupbuy";

const NAVER_TOP_K = 15;

// party_category(enum: delivery/offline_shopping/online_shopping) → FeedSection.
const PARTY_SECTION: Record<string, string> = {
  delivery: "delivery",
  offline_shopping: "food",
  online_shopping: "food",
};

export type Candidate = {
  ref: string; // "groupbuy:<slug>" | "party:<id>" | "naver:<link>"
  type: "groupbuy" | "party" | "naver";
  title: string;
  section: string | null;
  price: number | null; // 원, 없으면 null
  subtitle?: string;
  deadline?: string; // ISO (공구·모집글)
};

export type RecProfile = {
  id: string;
  favoriteCategories: string[];
  gender: string | null;
  neighborhood: { id: string; name: string; district: string } | null;
};

// ① 모집중 공구 — 플랫폼 config(마감 미래) + DB parties(status='recruiting').
async function getActiveGroupBuys(neighborhoodId: string | null): Promise<Candidate[]> {
  const now = Date.now();
  const out: Candidate[] = [];

  // 플랫폼 공구(config) — 동네 무관, 마감 안 지난 것 전량.
  for (const gb of GROUP_BUYS) {
    if (Date.parse(gb.deadlineAt) <= now) continue;
    const minPrice = gb.options.reduce(
      (m, o) => (o.groupPrice < m ? o.groupPrice : m),
      gb.options[0]?.groupPrice ?? 0,
    );
    out.push({
      ref: `groupbuy:${gb.slug}`,
      type: "groupbuy",
      title: gb.title,
      section: categoryInfoFor(gb.categoryValue)?.section ?? null,
      price: minPrice || null,
      subtitle: gb.subtitle,
      deadline: gb.deadlineAt,
    });
  }

  // 사용자 모집글(parties) — 같은 동네, 모집중, 신청 마감 전.
  if (neighborhoodId) {
    const { data } = await createAdminClient()
      .from("parties")
      .select("id, store_name, representative_menu, category, price_per_person, apply_deadline_at")
      .eq("neighborhood_id", neighborhoodId)
      .eq("status", "recruiting")
      .gt("apply_deadline_at", new Date(now).toISOString())
      .order("apply_deadline_at", { ascending: true })
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null }));

    for (const p of (data ?? []) as Array<{
      id: string;
      store_name: string;
      representative_menu: string | null;
      category: string;
      price_per_person: number;
      apply_deadline_at: string;
    }>) {
      out.push({
        ref: `party:${p.id}`,
        type: "party",
        title: p.representative_menu ? `${p.store_name} · ${p.representative_menu}` : p.store_name,
        section: PARTY_SECTION[p.category] ?? null,
        price: p.price_per_person || null,
        subtitle: "이웃 모집중",
        deadline: p.apply_deadline_at,
      });
    }
  }

  return out;
}

// ② 네이버 동네 캐시 — 5신호 점수로 상위 K shortlist.
async function getNaverShortlist(profile: RecProfile): Promise<Candidate[]> {
  const nb = profile.neighborhood;
  if (!nb || !isNaverConfigured()) return [];

  let feed;
  try {
    const r = await getNeighborhoodFeed({ neighborhoodId: nb.id, name: nb.name, district: nb.district });
    feed = r.feed;
  } catch {
    return [];
  }

  const signals = await getRankingSignals(profile.id, {
    favoriteCategories: profile.favoriteCategories,
    gender: profile.gender,
  });

  // 섹션 평탄화 → link 중복 제거 → 점수 → 상위 K.
  const seen = new Set<string>();
  const scored: { card: { section: string; title: string; subtitle: string; link: string }; score: number }[] = [];
  for (const cards of Object.values(feed.sections)) {
    for (const c of cards as Array<{ section: string; title: string; subtitle: string; link: string }>) {
      if (seen.has(c.link)) continue;
      seen.add(c.link);
      scored.push({ card: c, score: scoreCard(c, signals) });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, NAVER_TOP_K).map(({ card }) => ({
    ref: `naver:${card.link}`,
    type: "naver" as const,
    title: card.title,
    section: card.section,
    price: parsePriceFromSubtitle(card.subtitle),
    subtitle: card.subtitle,
  }));
}

/**
 * 추천 후보 전체 — 공구 전량 + 네이버 top-K. ref 기준 중복 제거.
 * 공구를 앞에 둔다(전환 목표 우선).
 */
export async function assembleCandidates(profile: RecProfile): Promise<Candidate[]> {
  const [groupBuys, naver] = await Promise.all([
    getActiveGroupBuys(profile.neighborhood?.id ?? null),
    getNaverShortlist(profile),
  ]);
  const merged = [...groupBuys, ...naver];
  const seen = new Set<string>();
  return merged.filter((c) => (seen.has(c.ref) ? false : (seen.add(c.ref), true)));
}
