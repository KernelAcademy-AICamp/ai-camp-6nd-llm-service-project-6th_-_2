// 5신호 개인화 랭킹 — 사용자 신호 수집(서버).
//
// 한 유저의 신호를 한 번에 조회·정규화해 RankingSignal[] 로 반환한다.
//   S1 명시 관심사  → profiles.favorite_categories (감쇠 없음)
//   S3 찜 이력      → store_favorites (title 역매칭, created_at 감쇠)
//   S4 공구 참여    → group_buy_participants (slug→config, created_at 감쇠)
//   S5 검색·클릭    → user_events (최근 90일, 키워드별 0.5×횟수 cap 3, 감쇠)
//   S6 성향 태그    → user_tags (1시간 배치 집계, 섹션 prior 약가점, 감쇠 없음)
//
// 매칭·점수화는 personalize.ts(scoreCard/rankSections)가 담당. 여기선 신호만 만든다.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGroupBuy } from "@/lib/groupbuy";
import {
  RANK_WEIGHTS,
  GENDER_AFFINITY,
  GENDER_WEIGHT,
  categoryInfoFor,
  categoryLabelFor,
  deriveSignalFromTitle,
  type RankingSignal,
} from "./personalize";

const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_WINDOW_DAYS = 90;

// S6 성향 태그 → 섹션 prior. 카테고리성 태그만 약가점(behavioral 태그는 정렬 영향 없음).
// "강하게 적용하면 편견" 원칙 → 가중치는 작게(+1, 감쇠 없음). meta.label 은 디버거 표기용.
const TAG_SECTION_PRIOR: Record<string, { section: RankingSignal["section"]; label: string }> = {
  food_focused: { section: "food", label: "식품 위주" },
  costco_lover: { section: "food", label: "코스트코 선호" },
};
const TAG_PRIOR_WEIGHT = 1;

// 모집글(parties) category(enum: delivery/offline_shopping/online_shopping) → FeedSection.
const PARTY_SECTION: Record<string, RankingSignal["section"]> = {
  delivery: "delivery",
  offline_shopping: "food",
  online_shopping: "food",
};

const daysSince = (iso: string, now: number): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now - t) / DAY_MS);
};

/**
 * 유저의 개인화 신호 전체를 모은다. profile 값(favorite_categories·gender)은 호출부에서
 * 이미 조회한 값을 넘겨 중복 쿼리를 피한다.
 */
export async function getRankingSignals(
  userId: string,
  opts: { favoriteCategories?: string[]; gender?: string | null },
): Promise<RankingSignal[]> {
  const now = Date.now();
  const signals: RankingSignal[] = [];

  // --- S1 명시 관심사 (감쇠 없음) ---
  for (const value of opts.favoriteCategories ?? []) {
    const info = categoryInfoFor(value);
    if (!info) continue;
    const isOther = value.startsWith("other:");
    signals.push({
      source: "interest",
      section: info.section,
      // 자유입력(other:)은 키워드 매칭, 칩 카테고리는 섹션 매칭. 둘 다 +2.
      keyword: isOther ? info.keywords[0] : undefined,
      catWeight: RANK_WEIGHTS.interest,
      itemWeight: RANK_WEIGHTS.interest,
      ageDays: 0,
      decays: false,
      // 디버거 라벨: 칩은 품목명("고기")으로 구분(자유입력은 keyword가 곧 라벨).
      meta: isOther ? undefined : { label: categoryLabelFor(value) },
    });
  }

  // --- S2 성별 적합 (약한 섹션 가점, 감쇠 없음) ---
  for (const section of GENDER_AFFINITY[opts.gender ?? ""] ?? []) {
    signals.push({
      source: "gender",
      section,
      catWeight: GENDER_WEIGHT,
      itemWeight: GENDER_WEIGHT,
      ageDays: 0,
      decays: false,
    });
  }

  const admin = createAdminClient();

  // 찜 / 공구 / 이벤트 / 성향태그 / 모집글을 병렬 조회 (각각 실패해도 나머지는 살린다).
  const [favRes, gbRes, evRes, tagRes, partyRes] = await Promise.all([
    admin
      .from("store_favorites")
      .select("title, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null })),
    admin
      .from("group_buy_participants")
      .select("slug, created_at")
      .eq("user_id", userId)
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null })),
    admin
      .from("user_events")
      .select("kind, keyword, created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(now - SEARCH_WINDOW_DAYS * DAY_MS).toISOString())
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null })),
    admin
      .from("user_tags")
      .select("tag, confidence")
      .eq("user_id", userId)
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null })),
    // S4b 모집글(내가 만든/참여한) — party_participants → parties 조인.
    admin
      .from("party_participants")
      .select("applied_at, parties(category, store_name, representative_menu)")
      .eq("user_id", userId)
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null })),
  ]);

  // --- S3 찜 이력 (같은 품목은 최신 1건만 점수, 횟수는 디버거 표기용 meta.count) ---
  const favRows = (favRes.data ?? []) as { title: string; created_at: string }[];
  const favBucket = new Map<
    string,
    { section: RankingSignal["section"]; keyword: string; ageDays: number; count: number }
  >();
  for (const row of favRows) {
    const d = deriveSignalFromTitle(row.title ?? "");
    if (!d) continue;
    const key = `${d.section}::${d.keyword}`;
    const prev = favBucket.get(key);
    if (prev) prev.count += 1; // created_at desc → ageDays는 첫(최신) 건 유지
    else favBucket.set(key, { ...d, ageDays: daysSince(row.created_at, now), count: 1 });
  }
  for (const b of favBucket.values()) {
    signals.push({
      source: "favorite",
      section: b.section,
      keyword: b.keyword,
      // catWeight 0: 행동 신호는 "품목 키워드 일치"일 때만 점수.
      // 같은 섹션(예: 삼겹 찜 → 식품 섹션의 무관한 상품)으로 번지지 않게.
      catWeight: 0,
      itemWeight: RANK_WEIGHTS.favoriteItem,
      ageDays: b.ageDays,
      meta: { count: b.count },
    });
  }

  // --- S4 공구 참여 (slug→config→품목) ---
  const gbRows = (gbRes.data ?? []) as { slug: string; created_at: string }[];
  for (const row of gbRows) {
    const gb = getGroupBuy(row.slug);
    if (!gb?.categoryValue) continue;
    const info = categoryInfoFor(gb.categoryValue);
    if (!info) continue;
    signals.push({
      source: "groupbuy",
      section: info.section,
      keyword: info.keywords[0],
      // catWeight 0: 찜과 동일 — 품목 키워드 일치일 때만 점수(섹션 번짐 방지).
      catWeight: 0,
      itemWeight: RANK_WEIGHTS.groupBuyItem,
      ageDays: daysSince(row.created_at, now),
      meta: { count: 1 },
    });
  }

  // --- S4b 모집글(내가 만든/참여한) — 공구와 동일 가중. 품목 키워드는 메뉴/상호에서 추출 ---
  const partyRows = (partyRes.data ?? []) as Array<{
    applied_at: string;
    parties:
      | { category: string; store_name: string; representative_menu: string | null }
      | { category: string; store_name: string; representative_menu: string | null }[]
      | null;
  }>;
  for (const row of partyRows) {
    const praw = row.parties;
    const p = Array.isArray(praw) ? praw[0] : praw;
    if (!p) continue;
    const text = (p.representative_menu || p.store_name || "").trim();
    // 알려진 품목 키워드면 그걸로(섹션까지), 아니면 메뉴 텍스트를 그대로 키워드로.
    const derived = deriveSignalFromTitle(text);
    signals.push({
      source: "groupbuy",
      section: derived?.section ?? PARTY_SECTION[p.category] ?? "food",
      keyword: derived?.keyword ?? (text || undefined),
      catWeight: 0, // 공구와 동일 — 품목 키워드 일치일 때만 점수.
      itemWeight: RANK_WEIGHTS.groupBuyItem,
      ageDays: daysSince(row.applied_at, now),
      meta: { count: 1 },
    });
  }

  // --- S5 검색·클릭 (키워드별 0.5×횟수, cap 3, 최신 시점으로 감쇠) ---
  const evRows = (evRes.data ?? []) as { keyword: string; created_at: string }[];
  const byKeyword = new Map<string, { count: number; latest: number }>();
  for (const row of evRows) {
    const kw = (row.keyword ?? "").trim();
    if (!kw) continue;
    const t = Date.parse(row.created_at);
    const prev = byKeyword.get(kw);
    if (prev) {
      prev.count += 1;
      if (!Number.isNaN(t) && t > prev.latest) prev.latest = t;
    } else {
      byKeyword.set(kw, { count: 1, latest: Number.isNaN(t) ? now : t });
    }
  }
  for (const [kw, agg] of byKeyword) {
    const weight = Math.min(RANK_WEIGHTS.searchPerHit * agg.count, RANK_WEIGHTS.searchCap);
    // 검색은 품목 키워드 매칭만(섹션 가점 없음). 섹션은 역매칭 시도, 실패하면 food 기본.
    const d = deriveSignalFromTitle(kw);
    signals.push({
      source: "search",
      section: d?.section ?? "food",
      keyword: kw,
      catWeight: 0,
      itemWeight: weight,
      ageDays: Math.max(0, (now - agg.latest) / DAY_MS),
      meta: { count: agg.count },
    });
  }

  // --- S6 성향 태그 (카테고리성 태그만 섹션 prior, 감쇠 없음) ---
  const tagRows = (tagRes.data ?? []) as { tag: string; confidence: number }[];
  for (const row of tagRows) {
    const prior = TAG_SECTION_PRIOR[row.tag];
    if (!prior) continue; // behavioral 태그(저녁·주말·적극참여·가성비)는 정렬 영향 없음
    signals.push({
      source: "tag",
      section: prior.section,
      catWeight: TAG_PRIOR_WEIGHT,
      itemWeight: TAG_PRIOR_WEIGHT,
      ageDays: 0,
      decays: false,
      meta: { label: prior.label },
    });
  }

  return signals;
}
