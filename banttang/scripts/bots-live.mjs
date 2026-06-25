// 띵동 라이브 봇 — 미리 짠 대본 없이, 각 페르소나가 "지금 피드 상태"를 보고 행동한다.
// 판단(두뇌)은 이 세션(Claude Code)이 직접 한다 → ANTHROPIC_API_KEY 소모 0.
//
//   1) --observe : 깨어있는(또는 --weighted 로 성향 가중 무작위 1명) 봇의 현재 상태를 JSON으로 출력
//   2) 세션이 그 상태를 보고 페르소나별 행동을 결정해 결정파일(JSON 배열)로 쓴다
//   3) --act <file> : 결정대로 실제 API/DB에 실행
//
//   node --env-file=apps/web/.env.local scripts/bots-live.mjs --observe [--group 1 | --weighted | --keys jieun,haneul]
//   node --env-file=apps/web/.env.local scripts/bots-live.mjs --act /tmp/decisions.json
//
// --group N : 봇을 10명씩 묶은 군(1군=bot01~10 / 2군=bot11~20 / 3군=bot21~30)만 관찰. 쉼표로 다중(--group 1,2).
//
// 인증은 banttang_user_id 쿠키(lib/auth.ts). 상태 읽기는 service key로 직접.
// 페르소나 정의는 scripts/bot-personas.mjs (그 파일만 고치면 됨).
//
// 결정파일(--act) 형식: [{ "key":"haneul", "action":"create_post", "category":"question", "title":"...", "body":"..." }, ...]
//   action: idle | join | approve | chat | create_party | create_post | comment | like_post

import { createClient } from "@supabase/supabase-js";
import { PERSONAS, keysInGroups } from "./bot-personas.mjs"; // 페르소나는 이 파일만 고치면 됨

// ── 설정 ────────────────────────────────────────────────────
const BASE_URL = (process.env.BASE_URL || "https://ttingdong.vercel.app").replace(/\/$/, "");
const PASSWORD = process.env.BOT_PASSWORD;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY;
const IGNORE_HOURS = process.env.IGNORE_HOURS === "1";
const MAX_ACTIONS_PER_TICK = Number(process.env.MAX_ACTIONS_PER_TICK || 3);

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

if (!SUPA_URL || !SUPA_KEY || !PASSWORD) {
  console.error("missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / BOT_PASSWORD (use --env-file=apps/web/.env.local)");
  process.exit(1);
}
const admin = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ── 유틸 ────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const kstHour = () => Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false })) % 24;
function isAwake(p) {
  if (IGNORE_HOURS) return true;
  const h = kstHour();
  return (p.awake ?? [[0, 24]]).some(([s, e]) => h >= s && h < e);
}

// 쿠키잼이 달린 fetch — 페르소나별 세션 격리
function newSession() {
  return { cookies: new Map() };
}
async function sreq(sess, path, { method = "GET", json } = {}) {
  const headers = {};
  if (json !== undefined) headers["content-type"] = "application/json";
  if (sess.cookies.size) headers["cookie"] = [...sess.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const pair = sc.split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) sess.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  let body = null;
  if ((res.headers.get("content-type") || "").includes("json")) {
    try { body = await res.json(); } catch { /* ignore */ }
  }
  return { ok: res.ok, status: res.status, body };
}

// ── 페르소나 부팅: 로그인 세션 + userId 확보 (틱 사이 캐시) ──
const actors = {}; // key -> { key, p, sess, userId }
let authUsersCache = null;

async function resolveUserId(email) {
  if (!authUsersCache) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    authUsersCache = data?.users ?? [];
  }
  return authUsersCache.find((u) => u.email === email)?.id ?? null;
}

async function ensureActor(key) {
  if (actors[key]) return actors[key];
  const p = PERSONAS[key];
  const sess = newSession();
  // 가입 → 실패 시 로그인
  let r = await sreq(sess, "/api/auth/email-signup", {
    method: "POST",
    json: { email: p.email, password: PASSWORD, nickname: p.nickname, gender: p.gender },
  });
  if (!r.ok) {
    r = await sreq(sess, "/api/auth/email-signin", { method: "POST", json: { email: p.email, password: PASSWORD } });
    if (!r.ok) throw new Error(`[${p.nickname}] 인증 실패: ${r.body?.error ?? r.status}`);
  }
  // onboarding/address 는 호출하지 않는다 — 봇 동작(API/커뮤니티)은 address 쿠키가 필요 없고,
  // 이 호출이 home 좌표 트리거로 profiles.neighborhood_id 를 좌표 기준으로 덮어써서
  // 우리가 정한 동네 배치(set-bot-neighborhoods.mjs)를 망가뜨린다.
  const userId = await resolveUserId(p.email);
  const { data: prof } = await admin.from("profiles").select("neighborhood_id").eq("id", userId).maybeSingle();
  actors[key] = { key, p, sess, userId, neighborhoodId: prof?.neighborhood_id ?? null };
  return actors[key];
}

// ── 상태 수집 (Supabase 직접 읽기) ──────────────────────────
async function gatherState(actor) {
  const me = actor.userId;

  // 1) 모집중 파티 + 점유 인원
  const { data: open } = await admin
    .from("v_parties_with_stats")
    .select("id, host_id, host_nickname, category, store_name, representative_menu, price_per_person, max_participants, deal_at")
    .eq("status", "recruiting");
  const openIds = (open ?? []).map((o) => o.id);

  const { data: parts } = openIds.length
    ? await admin.from("party_participants").select("party_id, user_id, status").in("party_id", openIds)
    : { data: [] };
  const occ = new Map();
  const mine = new Set();
  for (const pt of parts ?? []) {
    if (pt.status === "approved" || pt.status === "pending") {
      occ.set(pt.party_id, (occ.get(pt.party_id) ?? 0) + 1);
      if (pt.user_id === me) mine.add(pt.party_id);
    }
  }
  const joinable = (open ?? [])
    .filter((o) => o.host_id !== me && !mine.has(o.id) && (occ.get(o.id) ?? 0) < o.max_participants)
    .map((o) => ({
      party_id: o.id,
      host: o.host_nickname,
      category: o.category,
      store: o.store_name,
      menu: o.representative_menu,
      price_per_person: o.price_per_person,
      filled: `${occ.get(o.id) ?? 0}/${o.max_participants}`,
      deal_at: o.deal_at,
    }));

  // 2) 내가 호스트인데 pending 신청자가 있는 모집글 → 승인 가능
  const myHosted = (open ?? []).filter((o) => o.host_id === me);
  const pendingToApprove = [];
  for (const h of myHosted) {
    const cnt = (parts ?? []).filter((pt) => pt.party_id === h.id && pt.status === "pending").length;
    if (cnt > 0) pendingToApprove.push({ party_id: h.id, store: h.store_name, pending: cnt });
  }

  // 3) 내 채팅방 (closed/in_progress, 내가 멤버) + 최근 메시지
  const { data: myMemberRows } = await admin
    .from("party_participants")
    .select("party_id")
    .eq("user_id", me)
    .eq("status", "approved");
  const myPartyIds = (myMemberRows ?? []).map((m) => m.party_id);
  const myChats = [];
  if (myPartyIds.length) {
    const { data: rooms } = await admin
      .from("chat_rooms")
      .select("id, party_id, parties(store_name, status)")
      .in("party_id", myPartyIds);
    for (const room of rooms ?? []) {
      const st = room.parties?.status;
      if (st !== "closed" && st !== "in_progress") continue;
      const { data: msgs } = await admin
        .from("chat_messages")
        .select("sender_id, type, content, created_at")
        .eq("room_id", room.id)
        .order("created_at", { ascending: false })
        .limit(4);
      const recent = (msgs ?? []).reverse().map((m) => ({
        mine: m.sender_id === me,
        type: m.type,
        content: m.content,
      }));
      const lastIsMine = recent.length > 0 && recent[recent.length - 1].mine;
      myChats.push({ party_id: room.party_id, store: room.parties?.store_name, recent, lastIsMine });
    }
  }

  // 4) 우리 동네 커뮤니티 게시판 (최근 글 + 내 좋아요 여부)
  const community = [];
  if (actor.neighborhoodId) {
    const { data: posts } = await admin
      .from("community_posts")
      .select("id, author_id, category, title, body, comment_count, like_count, created_at")
      .eq("neighborhood_id", actor.neighborhoodId)
      .order("created_at", { ascending: false })
      .limit(8);
    const postIds = (posts ?? []).map((pp) => pp.id);
    const { data: myLikes } = postIds.length
      ? await admin.from("community_post_likes").select("post_id").eq("user_id", me).in("post_id", postIds)
      : { data: [] };
    const liked = new Set((myLikes ?? []).map((l) => l.post_id));
    for (const pp of posts ?? []) {
      community.push({
        post_id: pp.id,
        mine: pp.author_id === me,
        category: pp.category,
        title: pp.title,
        snippet: (pp.body ?? "").slice(0, 80),
        comments: pp.comment_count,
        likes: pp.like_count,
        i_liked: liked.has(pp.id),
      });
    }
  }

  return { joinable, pendingToApprove, myChats, community };
}

// ── 행동 실행 ───────────────────────────────────────────────
async function pickPickup(actor) {
  try {
    const r = await sreq(actor.sess, "/api/recommend-places", { method: "POST", json: { lat: actor.p.lat, lng: actor.p.lng } });
    const place = (r.body?.places ?? [])[0];
    if (place && typeof place.lat === "number") return { name: place.name, lat: place.lat, lng: place.lng };
  } catch { /* fallback */ }
  return { name: `${actor.p.address} 인근 픽업`, lat: actor.p.lat, lng: actor.p.lng };
}

async function execute(actor, d) {
  const nick = actor.p.nickname;
  switch (d.action) {
    case "join": {
      if (!d.party_id) return `${nick}: join 대상 없음`;
      const r = await sreq(actor.sess, `/api/parties/${d.party_id}/join`, { method: "POST", json: {} });
      return `${nick} ▶ 참여신청 ${d.party_id.slice(0, 8)} ${r.ok ? "✓" : "✗ " + (r.body?.error ?? r.status)}`;
    }
    case "approve": {
      if (!d.party_id) return `${nick}: approve 대상 없음`;
      const r = await sreq(actor.sess, `/api/parties/${d.party_id}/approve`, { method: "POST", json: {} });
      return `${nick} ▶ 신청수락 ${d.party_id.slice(0, 8)} ${r.ok ? "✓ (채팅방 오픈)" : "✗ " + (r.body?.error ?? r.status)}`;
    }
    case "chat": {
      if (!d.party_id || !d.message) return `${nick}: chat 내용 없음`;
      const r = await sreq(actor.sess, `/api/parties/${d.party_id}/messages`, { method: "POST", json: { content: d.message } });
      return `${nick} 💬 "${d.message}" ${r.ok ? "✓" : "✗ " + (r.body?.error ?? r.status)}`;
    }
    case "create_party": {
      const pickup = await pickPickup(actor);
      const single = d.split !== "individual";
      let representative_menu, price_per_person;
      if (single) {
        representative_menu = d.menu ?? d.store_name;
        price_per_person = Math.max(0, Math.round(d.price_per_person ?? 8000));
      } else {
        const parts = [];
        if (d.min_order) parts.push(`최소주문금액 ${Number(d.min_order).toLocaleString()}원`);
        if (d.delivery_fee) parts.push(`배송비 ${Number(d.delivery_fee).toLocaleString()}원`);
        representative_menu = parts.join(" · ") || "각자 결제";
        price_per_person = 0;
      }
      const dealInHours = Math.min(30, Math.max(2, Math.round(d.deal_in_hours ?? 6)));
      const r = await sreq(actor.sess, "/api/parties", {
        method: "POST",
        json: {
          category: d.category === "offline_shopping" ? "offline_shopping" : "delivery",
          store_name: d.store_name ?? "신림동 반띵",
          representative_menu,
          max_participants: Math.min(4, Math.max(2, (d.additional_needed ?? 1) + 1)),
          price_per_person,
          custom_pickup_name: pickup.name,
          custom_pickup_lat: pickup.lat,
          custom_pickup_lng: pickup.lng,
          deal_at: new Date(Date.now() + dealInHours * 3600 * 1000).toISOString(),
          gender_option: "all",
        },
      });
      return `${nick} ▶ 모집글 "${d.store_name}" ${r.ok ? "✓ " + r.body.id.slice(0, 8) : "✗ " + (r.body?.error ?? r.status)}`;
    }
    case "create_post": {
      if (!actor.neighborhoodId) return `${nick}: 동네 미설정`;
      const cat = ["free", "question", "share", "info", "meetup"].includes(d.category) ? d.category : "free";
      const { data, error } = await admin
        .from("community_posts")
        .insert({
          neighborhood_id: actor.neighborhoodId,
          author_id: actor.userId,
          category: cat,
          title: String(d.title ?? "").slice(0, 100),
          body: String(d.body ?? "").slice(0, 2000),
          image_paths: [],
        })
        .select("id")
        .single();
      return `${nick} 📝 글[${cat}] "${d.title}" ${error ? "✗ " + error.message : "✓ " + data.id.slice(0, 8)}`;
    }
    case "comment": {
      if (!d.post_id || !d.body) return `${nick}: 댓글 내용 없음`;
      const { error } = await admin.from("community_comments").insert({
        post_id: d.post_id,
        author_id: actor.userId,
        body: String(d.body).slice(0, 1000),
        parent_id: null,
      });
      return `${nick} 🗨 댓글 "${String(d.body).slice(0, 30)}" ${error ? "✗ " + error.message : "✓"}`;
    }
    case "like_post": {
      if (!d.post_id) return `${nick}: 좋아요 대상 없음`;
      const { error } = await admin
        .from("community_post_likes")
        .insert({ post_id: d.post_id, user_id: actor.userId });
      return `${nick} 👍 글 ${d.post_id.slice(0, 8)} ${error ? "(이미 눌렀거나 ✗)" : "✓"}`;
    }
    default:
      return `${nick} … (idle: ${d.reason ?? ""})`;
  }
}

// ── 모드 1: observe — 봇들의 현재 상태를 JSON으로 출력 ──
// 이 세션(Claude Code)이 직접 판단하는 워크플로우용. LLM API 호출 없음.
async function observe() {
  // --group 1 / --group 2,3 : 해당 군의 봇만 후보 풀로 둔다. 없으면 전체.
  const groupArg = argVal("--group", null);
  const pool = groupArg
    ? keysInGroups(groupArg.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)))
    : Object.keys(PERSONAS);
  if (!pool.length) {
    console.error(`--group '${groupArg}' 에 해당하는 봇 없음 (군은 1|2|3)`);
    process.exit(1);
  }
  const awake = pool.filter((k) => isAwake(PERSONAS[k]) && Math.random() < PERSONAS[k].p);
  // --keys jieun,minhyuk 로 특정 봇만 강제 관찰(시간대/확률 무시).
  const keysArg = argVal("--keys", null);
  // --weighted: 페르소나 성향(활동성 p × 활동 시간대 여부)으로 가중치를 둬 무작위로 1명 선택.
  const weighted = args.includes("--weighted");
  let chosen;
  if (keysArg) {
    chosen = keysArg.split(",").map((s) => s.trim()).filter((k) => PERSONAS[k]);
  } else if (weighted) {
    const keys = pool;
    const weights = keys.map((k) => (PERSONAS[k].p ?? 0.5) * (isAwake(PERSONAS[k]) ? 3 : 0.4));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < keys.length - 1; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    chosen = [keys[idx]];
  } else {
    chosen = awake.sort(() => Math.random() - 0.5).slice(0, MAX_ACTIONS_PER_TICK);
  }
  const out = [];
  for (const key of chosen) {
    try {
      const actor = await ensureActor(key);
      const state = await gatherState(actor);
      out.push({ key, nickname: actor.p.nickname, bio: actor.p.bio, state });
    } catch (e) {
      out.push({ key, nickname: PERSONAS[key].nickname, error: e.message });
    }
  }
  console.log(JSON.stringify({ kst_hour: kstHour(), awake: awake.length, personas: out }, null, 2));
}

// ── 모드 2: act — 외부(이 세션)가 내린 결정 배열을 실제로 실행 ──
// 결정 파일 형식: [{ "key": "jieun", "action": "create_post", ... }, ...]
async function actFromFile(path) {
  const fs = await import("node:fs/promises");
  const decisions = JSON.parse(await fs.readFile(path, "utf8"));
  for (const d of decisions) {
    try {
      const actor = await ensureActor(d.key);
      console.log("  " + (await execute(actor, d)));
    } catch (e) {
      console.log(`  ⚠ ${PERSONAS[d.key]?.nickname ?? d.key}: ${e.message}`);
    }
    await sleep(300);
  }
}

async function main() {
  if (args.includes("--observe")) return observe();
  const actIdx = args.indexOf("--act");
  if (actIdx >= 0) return actFromFile(args[actIdx + 1]);
  console.error("사용법: --observe [--group 1|2|3 (쉼표 다중)] [--weighted | --keys a,b] | --act <decisions.json>");
  process.exit(1);
}

main().catch((e) => {
  console.error("❌ 치명적 오류:", e.message);
  process.exit(1);
});
