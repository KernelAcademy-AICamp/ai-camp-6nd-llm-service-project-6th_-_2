// 운영자 — 회원 활동 대시보드 집계.
//   DAU/WAU·끈끈도·거래 성사율 · 일별 활성 · 행동 분포 · 활성화 퍼널 · 최근 활동.
//   docs/admin-user-management.md §9 Phase 4 · mockup: member_activity_dashboard

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGroupBuy } from "@/lib/groupbuy";

const DAY = 86400_000;

export type DashboardStats = {
  dau: number;
  wau: number;
  stickiness: string; // "0.32"
  dealRate: number | null; // % (최근 7일 모집글→정산, 북극성 지표)
  daily: { label: string; count: number }[]; // 최근 14일 활성 회원 수
  distribution: { label: string; pct: number; count: number }[];
  funnel: { label: string; count: number; pct: number }[];
  recent: { user_id: string | null; nickname: string; kind: string; keyword: string; created_at: string }[];
};

const KIND_LABEL: Record<string, string> = { search: "검색", click: "클릭", favorite: "찜", groupbuy: "공구" };

function dayKeyLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

async function countOf(q: Promise<{ count: number | null }>): Promise<number> {
  return q.then((r) => r.count ?? 0).catch(() => 0);
}
async function colOf(q: Promise<{ data: unknown }>): Promise<Record<string, unknown>[]> {
  return q.then((r) => (r.data ?? []) as Record<string, unknown>[]).catch(() => []);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const admin = createAdminClient();
  const now = Date.now();
  const since14 = new Date(now - 14 * DAY).toISOString();
  const since7 = new Date(now - 7 * DAY).toISOString();

  const [
    events14,
    chatMsgs14,
    partyJoins14,
    partiesHosted14,
    gbParts14,
    recentGb,
    recentPartyOpen,
    recentPartyJoin,
    allEventUsers,
    totalProfiles,
    new7,
    txUsers,
    partyUsers,
    gbUsers,
    parties7,
    partiesDone7,
    recent,
  ] = await Promise.all([
    colOf(admin.from("user_events").select("user_id, kind, created_at").gte("created_at", since14).limit(10000)),
    // 활성 회원은 스토어 행동에 국한하지 않는다 — 채팅·참여·호스팅·공구도 "그날 활동"으로 집계.
    colOf(admin.from("chat_messages").select("sender_id, created_at").gte("created_at", since14).limit(10000)),
    colOf(admin.from("party_participants").select("user_id, applied_at, is_host").gte("applied_at", since14).limit(10000)),
    colOf(admin.from("parties").select("host_id, created_at").gte("created_at", since14).limit(10000)),
    // 공구(스토어 상품) 참여 — user_events 에 안 쌓이므로 참여 테이블에서 직접 집계.
    colOf(admin.from("group_buy_participants").select("user_id, slug, created_at").gte("created_at", since14).limit(10000)),
    colOf(admin.from("group_buy_participants").select("user_id, slug, created_at, profiles(nickname)").order("created_at", { ascending: false }).limit(8)),
    // 모집글(공구) 개설·참여도 최근 활동 피드에 포함.
    colOf(admin.from("parties").select("host_id, store_name, created_at, profiles(nickname)").order("created_at", { ascending: false }).limit(8)),
    colOf(admin.from("party_participants").select("user_id, applied_at, is_host, profiles(nickname), parties(store_name)").order("applied_at", { ascending: false }).limit(16)),
    colOf(admin.from("user_events").select("user_id").limit(10000)),
    countOf(admin.from("profiles").select("id", { count: "exact", head: true })),
    countOf(admin.from("profiles").select("id", { count: "exact", head: true }).gte("joined_at", since7)),
    countOf(admin.from("profiles").select("id", { count: "exact", head: true }).gt("transaction_count", 0)),
    colOf(admin.from("party_participants").select("user_id").limit(10000)),
    colOf(admin.from("group_buy_participants").select("user_id").limit(10000)),
    countOf(admin.from("parties").select("id", { count: "exact", head: true }).gte("created_at", since7)),
    countOf(admin.from("parties").select("id", { count: "exact", head: true }).gte("created_at", since7).eq("status", "completed")),
    colOf(
      admin.from("user_events").select("user_id, kind, keyword, created_at, profiles(nickname)")
        .order("created_at", { ascending: false }).limit(8),
    ),
  ]);

  // 통합 활동 로그 — 스토어 이벤트 + 채팅 + 참여 + 호스팅을 (uid, 시각)으로 합침.
  const activity: { uid: string; ts: number }[] = [];
  for (const e of events14) activity.push({ uid: String(e.user_id), ts: Date.parse(String(e.created_at)) });
  for (const m of chatMsgs14) {
    if (m.sender_id) activity.push({ uid: String(m.sender_id), ts: Date.parse(String(m.created_at)) });
  }
  for (const j of partyJoins14) {
    if (j.user_id) activity.push({ uid: String(j.user_id), ts: Date.parse(String(j.applied_at)) });
  }
  for (const h of partiesHosted14) {
    if (h.host_id) activity.push({ uid: String(h.host_id), ts: Date.parse(String(h.created_at)) });
  }
  for (const g of gbParts14) {
    if (g.user_id) activity.push({ uid: String(g.user_id), ts: Date.parse(String(g.created_at)) });
  }

  // DAU / WAU / 일별 (통합 활동 기준)
  const dauSet = new Set<string>();
  const wauSet = new Set<string>();
  const dailyMap = new Map<string, Set<string>>();
  for (const a of activity) {
    if (!Number.isFinite(a.ts)) continue;
    if (now - a.ts < DAY) dauSet.add(a.uid);
    if (now - a.ts < 7 * DAY) wauSet.add(a.uid);
    const k = dayKeyLocal(new Date(a.ts).toISOString());
    if (!dailyMap.has(k)) dailyMap.set(k, new Set());
    dailyMap.get(k)!.add(a.uid);
  }
  const dau = dauSet.size;
  const wau = wauSet.size;
  const stickiness = wau ? (dau / wau).toFixed(2) : "0.00";

  // 최근 14일 일별 활성 회원
  const daily: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    daily.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count: dailyMap.get(key)?.size ?? 0 });
  }

  // 행동 분포 — 검색·클릭·찜(user_events) + 공구 활동(모집글·스토어 공구).
  //   공구 참여 = 모집글 참여(비호스트) + 스토어 상품 공구 / 공구 개설 = 모집글 개설.
  const evKind = new Map<string, number>();
  for (const e of events14) evKind.set(String(e.kind), (evKind.get(String(e.kind)) ?? 0) + 1);
  const partyJoinCount = partyJoins14.filter((p) => !p.is_host).length;
  const distRaw = [
    { label: KIND_LABEL.search, count: evKind.get("search") ?? 0 },
    { label: KIND_LABEL.click, count: evKind.get("click") ?? 0 },
    { label: KIND_LABEL.favorite, count: evKind.get("favorite") ?? 0 },
    { label: "공구 참여", count: partyJoinCount + gbParts14.length },
    { label: "공구 개설", count: partiesHosted14.length },
  ].filter((d) => d.count > 0);
  const distTotal = distRaw.reduce((a, b) => a + b.count, 0);
  const distribution = distRaw
    .map((d) => ({ label: d.label, count: d.count, pct: distTotal ? Math.round((100 * d.count) / distTotal) : 0 }))
    .sort((a, b) => b.count - a.count);

  // 활성화 퍼널 (전체 누적 기준). 각 단계는 상위의 부분집합이라 단조 감소해야 한다.
  //   첫 활동 = 무엇이든 한 회원 = 스토어 행동 ∪ 모집/공구 참여(채팅은 방=모집 멤버라 포함됨).
  const participatedIds = new Set([
    ...partyUsers.map((r) => String(r.user_id)),
    ...gbUsers.map((r) => String(r.user_id)),
  ]);
  const participated = participatedIds.size;
  const firstActivity = new Set([
    ...allEventUsers.map((r) => String(r.user_id)),
    ...participatedIds,
  ]).size;
  const pct = (n: number) => (totalProfiles ? Math.round((100 * n) / totalProfiles) : 0);
  const funnel = [
    { label: "가입", count: totalProfiles, pct: 100 },
    { label: "첫 활동", count: firstActivity, pct: pct(firstActivity) },
    { label: "모집·참여", count: participated, pct: pct(participated) },
    { label: "거래 성사", count: txUsers, pct: pct(txUsers) },
  ];

  const dealRate = parties7 ? Math.round((100 * partiesDone7) / parties7) : null;

  const nickOf = (p: unknown) =>
    (Array.isArray(p) ? p[0]?.nickname : (p as { nickname?: string })?.nickname) ?? "탈퇴/알수없음";

  // 스토어 행동(검색·클릭·찜) + 공구 참여를 한 피드로 합쳐 시간순 정렬.
  const idOrNull = (v: unknown) => (v ? String(v) : null);
  const recentStore = recent.map((r) => ({
    user_id: idOrNull(r.user_id),
    nickname: String(nickOf(r.profiles)),
    kind: String(r.kind),
    keyword: String(r.keyword ?? ""),
    created_at: String(r.created_at),
  }));
  const recentGroupBuy = recentGb.map((g) => ({
    user_id: idOrNull(g.user_id),
    nickname: String(nickOf(g.profiles)),
    kind: "groupbuy",
    keyword: getGroupBuy(String(g.slug))?.title ?? String(g.slug),
    created_at: String(g.created_at),
  }));
  const recentPartyOpened = recentPartyOpen.map((p) => ({
    user_id: idOrNull(p.host_id),
    nickname: String(nickOf(p.profiles)),
    kind: "party_open",
    keyword: String(p.store_name ?? ""),
    created_at: String(p.created_at),
  }));
  // 호스트(개설)는 위에서 잡으므로 참여 피드에선 제외해 중복 방지.
  const recentPartyJoined = recentPartyJoin
    .filter((p) => !p.is_host)
    .map((p) => ({
      user_id: idOrNull(p.user_id),
      nickname: String(nickOf(p.profiles)),
      kind: "party_join",
      keyword: String((p.parties as { store_name?: string } | null)?.store_name ?? ""),
      created_at: String(p.applied_at),
    }));
  const recentItems = [...recentStore, ...recentGroupBuy, ...recentPartyOpened, ...recentPartyJoined]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 10);

  // new7 은 현재 카드에 직접 노출 안 하지만, 향후 사용 위해 유지 가능 — 미사용 경고 방지로 참조.
  void new7;

  return { dau, wau, stickiness, dealRate, daily, distribution, funnel, recent: recentItems };
}
