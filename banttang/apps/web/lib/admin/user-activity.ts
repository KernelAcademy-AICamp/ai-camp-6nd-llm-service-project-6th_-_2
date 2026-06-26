// 운영자 — 회원 활동 타임라인. user_events(검색·클릭·찜·공구) 최근순.
//   docs/admin-user-management.md §9 Phase 3
// (거래 정산 등 도메인 이벤트 merge는 후속 — 현재는 행동 로그만)

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActivityItem = {
  kind: string; // search | click | favorite | groupbuy
  keyword: string;
  section: string | null;
  price: number | null;
  created_at: string;
};

export async function getUserActivity(userId: string, limit = 50): Promise<ActivityItem[]> {
  const res = await createAdminClient()
    .from("user_events")
    .select("kind, keyword, section, price, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .then((r: { data: unknown }) => r)
    .catch(() => ({ data: null }));
  return (res.data ?? []) as ActivityItem[];
}
