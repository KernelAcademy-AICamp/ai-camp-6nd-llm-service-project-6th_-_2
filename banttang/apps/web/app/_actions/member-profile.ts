"use server";

// 회원 공개 프로필 — 채팅방에서 상대를 탭하면 보는 신뢰 정보.
// 공개 가능한 값만(등급·거래·후기). 정확한 위치/홈 좌표·연락처는 노출하지 않는다.

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicReview = {
  rating: string; // good | bad
  text: string | null;
  is_no_show: boolean;
  created_at: string;
};

export type MemberPublicProfile = {
  id: string;
  nickname: string;
  level: string;
  neighborhood_name: string | null;
  joined_at: string;
  transaction_count: number;
  good_review_count: number;
  bad_review_count: number;
  no_show_count: number;
  reviews: PublicReview[];
  is_blocked: boolean; // 조회자(나)가 이 회원을 차단했는지
};

export async function getMemberPublicProfile(
  userId: string,
): Promise<MemberPublicProfile | null> {
  const me = await getCurrentUser();
  if (!me) return null;

  const admin = createAdminClient();
  const { data: p } = await admin
    .from("profiles")
    .select(
      "id, nickname, level, transaction_count, good_review_count, bad_review_count, " +
        "no_show_count, joined_at, neighborhoods(name)",
    )
    .eq("id", userId)
    .maybeSingle();
  if (!p) return null;

  const row = p as Record<string, unknown>;
  const nbRaw = row.neighborhoods as unknown;
  const nbName = (Array.isArray(nbRaw) ? nbRaw[0]?.name : (nbRaw as { name?: string })?.name) ?? null;

  // 후기·차단 여부는 서로 독립적 → 병렬 조회(왕복 1회로 단축).
  const [revsRes, blkRes] = await Promise.all([
    admin
      .from("reviews")
      .select("rating, text_review, is_no_show, created_at")
      .eq("reviewee_id", userId)
      .order("created_at", { ascending: false })
      .limit(8)
      .then((r: { data: unknown }) => r)
      .catch(() => ({ data: null })),
    me.id !== userId
      ? admin
          .from("user_blocks")
          .select("blocked_id")
          .eq("blocker_id", me.id)
          .eq("blocked_id", userId)
          .maybeSingle()
          .then((r: { data: unknown }) => r)
          .catch(() => ({ data: null }))
      : Promise.resolve({ data: null }),
  ]);

  const reviews: PublicReview[] = ((revsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    rating: String(r.rating),
    text: (r.text_review as string | null) ?? null,
    is_no_show: Boolean(r.is_no_show),
    created_at: String(r.created_at),
  }));

  // 내가 이 회원을 차단했는지 (본인 프로필이면 항상 false)
  const is_blocked = !!blkRes.data;

  return {
    id: String(row.id),
    nickname: String(row.nickname),
    level: String(row.level),
    neighborhood_name: nbName,
    joined_at: String(row.joined_at),
    transaction_count: Number(row.transaction_count ?? 0),
    good_review_count: Number(row.good_review_count ?? 0),
    bad_review_count: Number(row.bad_review_count ?? 0),
    no_show_count: Number(row.no_show_count ?? 0),
    reviews,
    is_blocked,
  };
}
