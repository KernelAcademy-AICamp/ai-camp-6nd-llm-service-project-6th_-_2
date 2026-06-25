// AI 추천 — 읽기 (노출용). user_recommendations 의 ref 를 실제 표시 카드로 해석.
//   naver:<link> → 동네 피드 카드 / groupbuy:<slug> → config / party:<id> → DB(모집중만).
//   만료·종료된 항목은 숨긴다(읽는 시점 재검증). recs 없으면 빈 배열 → 호출부가 폴백.
//   docs/ai-recommendation-rag.md §6

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GROUP_BUYS } from "@/lib/groupbuy";
import type { StoreCardData } from "@/components/StoreCard";
import type { FeedCard } from "@/lib/naver/cache";

const TOP_N = 10;

type RecItem = { ref: string; type: string; reason: string };

/**
 * 저장된 AI 추천을 표시 카드로 해석한다. feedSections 는 동네 피드(naver 카드 해석용).
 * 반환 순서 = 저장된 rank. 해석 불가/만료 항목은 건너뛴다.
 */
export async function getAiRecommendationCards(
  userId: string,
  feedSections: Record<string, FeedCard[]>,
): Promise<StoreCardData[]> {
  const admin = createAdminClient();

  const recRes = await admin
    .from("user_recommendations")
    .select("items")
    .eq("user_id", userId)
    .maybeSingle()
    .then((r: { data: unknown }) => r)
    .catch(() => ({ data: null }));

  const items = ((recRes.data as { items?: RecItem[] } | null)?.items ?? []) as RecItem[];
  if (items.length === 0) return [];

  // naver link → 카드.
  const cardByLink = new Map<string, FeedCard>();
  for (const cards of Object.values(feedSections)) {
    for (const c of cards) cardByLink.set(c.link, c);
  }

  // party ref 들 → 한 번에 "모집중" 검증.
  const partyIds = items
    .filter((it) => it.ref.startsWith("party:"))
    .map((it) => it.ref.slice("party:".length));
  const recruitingParties = new Map<string, { store_name: string; representative_menu: string | null }>();
  if (partyIds.length) {
    const { data } = await admin
      .from("parties")
      .select("id, store_name, representative_menu")
      .in("id", partyIds)
      .eq("status", "recruiting")
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null }));
    for (const p of (data ?? []) as Array<{ id: string; store_name: string; representative_menu: string | null }>) {
      recruitingParties.set(p.id, { store_name: p.store_name, representative_menu: p.representative_menu });
    }
  }

  const now = Date.now();
  const out: StoreCardData[] = [];
  for (const it of items) {
    if (out.length >= TOP_N) break;
    const reason = (it.reason ?? "").trim() || undefined;

    if (it.ref.startsWith("naver:")) {
      const link = it.ref.slice("naver:".length);
      const c = cardByLink.get(link);
      if (!c) continue; // 캐시 갱신으로 사라진 카드
      out.push({
        title: c.title,
        subtitle: c.subtitle,
        link: c.link,
        image: c.image,
        reason,
        favoriteKind: c.type === "shop" ? "product" : "store",
      });
    } else if (it.ref.startsWith("groupbuy:")) {
      const gb = GROUP_BUYS.find((g) => g.slug === it.ref.slice("groupbuy:".length));
      if (!gb || Date.parse(gb.deadlineAt) <= now) continue; // 만료 숨김
      out.push({
        title: gb.title,
        subtitle: gb.subtitle,
        link: `/groupbuy/${gb.slug}`,
        image: null,
        reason,
      });
    } else if (it.ref.startsWith("party:")) {
      const p = recruitingParties.get(it.ref.slice("party:".length));
      if (!p) continue; // 종료된 모집글 숨김
      out.push({
        title: p.representative_menu ? `${p.store_name} · ${p.representative_menu}` : p.store_name,
        subtitle: "이웃 모집중",
        link: `/feed/${it.ref.slice("party:".length)}`,
        image: null,
        reason,
      });
    }
  }

  return out;
}
