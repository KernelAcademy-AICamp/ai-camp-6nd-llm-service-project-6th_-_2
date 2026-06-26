// 운영자 — 동네별 통계 집계.
//   활성 동네(주간 활성 회원순) + 동네별 누적 통계(회원·모집글·성사율·공구).
//   귀속 기준: 회원/활성/공구는 회원의 neighborhood_id, 모집글·성사율은 parties.neighborhood_id.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY = 86400_000;

export type NeighborhoodStat = {
  id: string;
  name: string;
  district: string;
  members: number; // 동네 소속 회원 수
  weeklyActive: number; // 최근 7일 활동 회원(고유)
  parties: number; // 모집글 수(누적)
  partiesDone: number; // 완료 모집글 수
  completionRate: number | null; // % (완료/모집글)
  groupBuys: number; // 스토어 상품 공구 참여 수
};

async function colOf(q: Promise<{ data: unknown }>): Promise<Record<string, unknown>[]> {
  return q.then((r) => (r.data ?? []) as Record<string, unknown>[]).catch(() => []);
}
async function countOf(q: Promise<{ count: number | null }>): Promise<number> {
  return q.then((r) => r.count ?? 0).catch(() => 0);
}
function dayKeyLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export async function getNeighborhoodStats(): Promise<NeighborhoodStat[]> {
  const admin = createAdminClient();
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY).toISOString();

  const [neighborhoods, profilesRows, partiesRows, gbRows, evUsers, joinUsers, hostUsers, chatUsers] =
    await Promise.all([
      colOf(admin.from("neighborhoods").select("id, name, district, is_active")),
      colOf(admin.from("profiles").select("id, neighborhood_id").limit(10000)),
      colOf(admin.from("parties").select("neighborhood_id, status").limit(10000)),
      colOf(admin.from("group_buy_participants").select("user_id").limit(10000)),
      // 주간 활성: 활동 종류별 고유 user_id (최근 7일)
      colOf(admin.from("user_events").select("user_id").gte("created_at", since7).limit(10000)),
      colOf(admin.from("party_participants").select("user_id").gte("applied_at", since7).limit(10000)),
      colOf(admin.from("parties").select("host_id").gte("created_at", since7).limit(10000)),
      colOf(admin.from("chat_messages").select("sender_id").gte("created_at", since7).limit(10000)),
    ]);

  // 회원 → 동네 매핑 + 동네별 회원 수
  const userNb = new Map<string, string>();
  const members = new Map<string, number>();
  for (const p of profilesRows) {
    const uid = String(p.id);
    const nb = p.neighborhood_id ? String(p.neighborhood_id) : null;
    if (!nb) continue;
    userNb.set(uid, nb);
    members.set(nb, (members.get(nb) ?? 0) + 1);
  }

  // 모집글 / 완료 by 동네
  const parties = new Map<string, number>();
  const partiesDone = new Map<string, number>();
  for (const p of partiesRows) {
    if (!p.neighborhood_id) continue;
    const nb = String(p.neighborhood_id);
    parties.set(nb, (parties.get(nb) ?? 0) + 1);
    if (p.status === "completed") partiesDone.set(nb, (partiesDone.get(nb) ?? 0) + 1);
  }

  // 공구(스토어 상품) by 회원 동네
  const groupBuys = new Map<string, number>();
  for (const g of gbRows) {
    const nb = userNb.get(String(g.user_id));
    if (nb) groupBuys.set(nb, (groupBuys.get(nb) ?? 0) + 1);
  }

  // 주간 활성: 활동한 user_id 합집합 → 동네별 고유 회원
  const activeByNb = new Map<string, Set<string>>();
  const addActive = (rows: Record<string, unknown>[], key: string) => {
    for (const r of rows) {
      const uid = r[key];
      if (!uid) continue;
      const nb = userNb.get(String(uid));
      if (!nb) continue;
      if (!activeByNb.has(nb)) activeByNb.set(nb, new Set());
      activeByNb.get(nb)!.add(String(uid));
    }
  };
  addActive(evUsers, "user_id");
  addActive(joinUsers, "user_id");
  addActive(hostUsers, "host_id");
  addActive(chatUsers, "sender_id");

  const stats: NeighborhoodStat[] = neighborhoods.map((n) => {
    const id = String(n.id);
    const total = parties.get(id) ?? 0;
    const done = partiesDone.get(id) ?? 0;
    return {
      id,
      name: String(n.name),
      district: String(n.district),
      members: members.get(id) ?? 0,
      weeklyActive: activeByNb.get(id)?.size ?? 0,
      parties: total,
      partiesDone: done,
      completionRate: total ? Math.round((100 * done) / total) : null,
      groupBuys: groupBuys.get(id) ?? 0,
    };
  });

  // 활동/회원/모집글이 전혀 없는 동네(시드만 된 빈 동네)는 제외 — "활성 동네"만.
  const active = stats.filter(
    (s) => s.members > 0 || s.parties > 0 || s.weeklyActive > 0 || s.groupBuys > 0,
  );

  // 활성 회원 많은 순 → 회원 수 → 이름
  active.sort(
    (a, b) => b.weeklyActive - a.weeklyActive || b.members - a.members || a.name.localeCompare(b.name),
  );
  return active;
}

// ─────────────────────────────────────────────────────────────
// 단일 동네 대시보드 — 핵심 지표 + 일별 활성(14일) + 최근 모집글.
// ─────────────────────────────────────────────────────────────

export type NeighborhoodParty = {
  id: string;
  store_name: string;
  status: string;
  host_nickname: string | null;
  created_at: string;
};

export type NeighborhoodMember = {
  id: string;
  nickname: string;
  level: string;
  transaction_count: number;
  last_active_at: string | null;
  is_bot: boolean;
  suspended: boolean;
};

export type NeighborhoodDetail = {
  id: string;
  name: string;
  district: string;
  members: number;
  weeklyActive: number;
  parties: number;
  partiesDone: number;
  completionRate: number | null;
  groupBuys: number;
  daily: { label: string; count: number }[]; // 최근 14일 활성 회원
  distribution: { label: string; pct: number; count: number }[]; // 행동 분포(14일, 동네 회원)
  partyList: NeighborhoodParty[]; // 최근 모집글(상위 20)
  memberList: NeighborhoodMember[]; // 회원 목록(최근 활동순, 상위 30)
};

export async function getNeighborhoodDetail(id: string): Promise<NeighborhoodDetail | null> {
  const admin = createAdminClient();
  const now = Date.now();
  const DAY_N = DAY;
  const since14 = new Date(now - 14 * DAY_N).toISOString();

  const nbRow = await admin
    .from("neighborhoods")
    .select("id, name, district")
    .eq("id", id)
    .maybeSingle()
    .then((r: { data: unknown }) => r.data as Record<string, unknown> | null)
    .catch(() => null);
  if (!nbRow) return null;

  const [memberRows, partiesTotal, partiesDone, partyList, gbRows, evRows, joinRows, hostRows, chatRows] =
    await Promise.all([
      colOf(admin.from("profiles").select("id, nickname, level, transaction_count, last_active_at, is_bot, suspended_at").eq("neighborhood_id", id).limit(10000)),
      countOf(admin.from("parties").select("id", { count: "exact", head: true }).eq("neighborhood_id", id)),
      countOf(admin.from("parties").select("id", { count: "exact", head: true }).eq("neighborhood_id", id).eq("status", "completed")),
      colOf(admin.from("parties").select("id, store_name, status, created_at, profiles(nickname)").eq("neighborhood_id", id).order("created_at", { ascending: false }).limit(100)),
      colOf(admin.from("group_buy_participants").select("user_id, created_at").limit(10000)),
      colOf(admin.from("user_events").select("user_id, kind, created_at").gte("created_at", since14).limit(10000)),
      colOf(admin.from("party_participants").select("user_id, is_host, applied_at").gte("applied_at", since14).limit(10000)),
      colOf(admin.from("parties").select("host_id, created_at").gte("created_at", since14).limit(10000)),
      colOf(admin.from("chat_messages").select("sender_id, created_at").gte("created_at", since14).limit(10000)),
    ]);

  const memberIds = new Set(memberRows.map((m) => String(m.id)));

  // 공구(전체 누적) — 동네 회원의 참여만
  let groupBuys = 0;
  for (const g of gbRows) if (memberIds.has(String(g.user_id))) groupBuys++;

  // 활동(14일) → 동네 회원만 모아 (uid, ts)
  const acts: { uid: string; ts: number }[] = [];
  const push = (rows: Record<string, unknown>[], idKey: string, tsKey: string) => {
    for (const r of rows) {
      const uid = r[idKey];
      if (!uid || !memberIds.has(String(uid))) continue;
      acts.push({ uid: String(uid), ts: Date.parse(String(r[tsKey])) });
    }
  };
  push(evRows, "user_id", "created_at");
  push(joinRows, "user_id", "applied_at");
  push(hostRows, "host_id", "created_at");
  push(chatRows, "sender_id", "created_at");

  const weekAgo = now - 7 * DAY_N;
  const weeklySet = new Set<string>();
  const dailyMap = new Map<string, Set<string>>();
  for (const a of acts) {
    if (!Number.isFinite(a.ts)) continue;
    if (a.ts >= weekAgo) weeklySet.add(a.uid);
    const k = dayKeyLocal(a.ts);
    if (!dailyMap.has(k)) dailyMap.set(k, new Set());
    dailyMap.get(k)!.add(a.uid);
  }
  const daily: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY_N);
    daily.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count: dailyMap.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)?.size ?? 0,
    });
  }

  const nickOf = (p: unknown) =>
    (Array.isArray(p) ? p[0]?.nickname : (p as { nickname?: string })?.nickname) ?? null;

  // 행동 분포(14일, 동네 회원) — 검색·클릭·찜 + 공구 참여(모집 참여+스토어공구) + 공구 개설
  const evKind = new Map<string, number>();
  for (const e of evRows) {
    if (!memberIds.has(String(e.user_id))) continue;
    evKind.set(String(e.kind), (evKind.get(String(e.kind)) ?? 0) + 1);
  }
  const joinCount = joinRows.filter((p) => !p.is_host && memberIds.has(String(p.user_id))).length;
  const openCount = hostRows.filter((p) => memberIds.has(String(p.host_id))).length;
  const gb14 = gbRows.filter(
    (g) => memberIds.has(String(g.user_id)) && Date.parse(String(g.created_at)) >= Date.parse(since14),
  ).length;
  const distRaw = [
    { label: "검색", count: evKind.get("search") ?? 0 },
    { label: "클릭", count: evKind.get("click") ?? 0 },
    { label: "찜", count: evKind.get("favorite") ?? 0 },
    { label: "공구 참여", count: joinCount + gb14 },
    { label: "공구 개설", count: openCount },
  ].filter((d) => d.count > 0);
  const distTotal = distRaw.reduce((a, b) => a + b.count, 0);
  const distribution = distRaw
    .map((d) => ({ label: d.label, count: d.count, pct: distTotal ? Math.round((100 * d.count) / distTotal) : 0 }))
    .sort((a, b) => b.count - a.count);

  // 회원 목록(최근 활동순, 상위 30)
  const memberList: NeighborhoodMember[] = memberRows
    .map((m) => ({
      id: String(m.id),
      nickname: String(m.nickname),
      level: String(m.level),
      transaction_count: Number(m.transaction_count ?? 0),
      last_active_at: m.last_active_at ? String(m.last_active_at) : null,
      is_bot: !!m.is_bot,
      suspended: !!m.suspended_at,
    }))
    .sort((a, b) => Date.parse(b.last_active_at ?? "0") - Date.parse(a.last_active_at ?? "0"))
    .slice(0, 100);

  return {
    id: String(nbRow.id),
    name: String(nbRow.name),
    district: String(nbRow.district),
    members: memberIds.size,
    weeklyActive: weeklySet.size,
    parties: partiesTotal,
    partiesDone,
    completionRate: partiesTotal ? Math.round((100 * partiesDone) / partiesTotal) : null,
    groupBuys,
    daily,
    distribution,
    partyList: partyList.map((p) => ({
      id: String(p.id),
      store_name: String(p.store_name),
      status: String(p.status),
      host_nickname: nickOf(p.profiles),
      created_at: String(p.created_at),
    })),
    memberList,
  };
}
