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
//          | search_store | favorite_store | report
//     search_store   : { key, action:"search_store", keyword:"닭가슴살", section?:"food" } — 스토어 검색 1건(추천 신호)
//     favorite_store : { key, action:"favorite_store", kind:"product"|"store", title:"곰곰 닭가슴살 1kg",
//                       subtitle?:"12,900원 · 쿠팡", price?:12900, link?:"...", image?:"..." } — 스토어 찜(좋아요)
//     report         : { key, action:"report", target_type:"party"|"user"|"message"|"review",
//                       party_id?, target_user_id?, message_id?, review_id?,
//                       reason_code:"no_show"|"late"|"payment"|"abusive"|"scam"|"unfair"|"spam"|"other",
//                       reason_detail?:"40분째 안 나타나서 음식 다 식었어요" } — 거래 분쟁 신고.
//                       reports 테이블에 적재되어 운영자(/admin/reports) 큐에 뜬다.
//                       대상 id 는 거래 채팅 state 의 party_id / others[].user_id 에서 고른다.

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
    // 같은 거래의 다른 참여자(=신고 대상 후보). target_user_id 로 쓰라고 닉네임과 함께 내려준다.
    const { data: mates } = await admin
      .from("party_participants")
      .select("party_id, user_id, is_host, profiles(nickname)")
      .in("party_id", myPartyIds)
      .eq("status", "approved");
    const othersByParty = new Map();
    for (const m of mates ?? []) {
      if (m.user_id === me) continue;
      const arr = othersByParty.get(m.party_id) ?? [];
      arr.push({ user_id: m.user_id, nickname: m.profiles?.nickname ?? null, is_host: m.is_host });
      othersByParty.set(m.party_id, arr);
    }
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
      myChats.push({
        party_id: room.party_id,
        store: room.parties?.store_name,
        recent,
        lastIsMine,
        others: othersByParty.get(room.party_id) ?? [],
      });
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

  // 5) 스토어 — 최근 검색어 / 찜 목록. 세션이 "이미 한 건 빼고" 새 검색·찜을 고르게 한다.
  //    추천 신호(user_events search/favorite, store_favorites)를 봇이 직접 만들어 준다.
  const { data: evRows } = await admin
    .from("user_events")
    .select("kind, keyword, created_at")
    .eq("user_id", me)
    .in("kind", ["search", "favorite"])
    .order("created_at", { ascending: false })
    .limit(20);
  const recentSearches = [...new Set((evRows ?? []).filter((e) => e.kind === "search").map((e) => e.keyword))].slice(0, 8);
  const { data: favRows } = await admin
    .from("store_favorites")
    .select("kind, title")
    .eq("user_id", me)
    .order("created_at", { ascending: false })
    .limit(12);
  const favorited = (favRows ?? []).map((f) => ({ kind: f.kind, title: f.title }));

  return { joinable, pendingToApprove, myChats, community, store: { recentSearches, favorited } };
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
    case "search_store": {
      // 스토어 상품 검색 1건 → 추천 개인화 신호 S5(검색 이력). 실제 검색 UI 의 logUserEvent 와 동일.
      const keyword = String(d.keyword ?? "").trim().slice(0, 100);
      if (!keyword) return `${nick}: 검색어 없음`;
      const { error } = await admin.from("user_events").insert({
        user_id: actor.userId,
        kind: "search",
        keyword,
        section: d.section ?? null,
      });
      return `${nick} 🔍 스토어 검색 "${keyword}" ${error ? "✗ " + error.message : "✓"}`;
    }
    case "favorite_store": {
      // 스토어 찜(좋아요) → store_favorites + user_events(favorite). store-favorites.ts 서버액션과 동형.
      const title = String(d.title ?? "").trim();
      if (!title) return `${nick}: 찜 대상 없음`;
      const kind = d.kind === "store" ? "store" : "product";
      const subtitle = String(d.subtitle ?? "").slice(0, 300);
      // link 는 (user_id, link) 유일키 — 미지정 시 제목 기반 안정 링크로 중복 찜 방지.
      const link = d.link
        ? String(d.link)
        : (kind === "product"
            ? `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(title)}`
            : `https://map.naver.com/p/search/${encodeURIComponent(title)}`);
      const price = Number.isFinite(d.price) ? Math.round(d.price) : null;
      const { error } = await admin.from("store_favorites").insert({
        user_id: actor.userId,
        kind,
        title: title.slice(0, 200),
        subtitle,
        link,
        image: d.image ?? null,
      });
      if (error) return `${nick} 🤍 찜 "${title.slice(0, 20)}" (이미 찜했거나 ✗ ${error.message})`;
      // 통합 행동 로그 — 찜도 성향 태깅/추천 입력으로 적재(섹션은 세션이 알면 전달).
      await admin.from("user_events").insert({
        user_id: actor.userId,
        kind: "favorite",
        keyword: title.slice(0, 100),
        section: d.section ?? null,
        price,
      });
      return `${nick} ❤️ 스토어 찜[${kind}] "${title.slice(0, 20)}" ✓`;
    }
    case "report": {
      // 거래 분쟁 신고 → reports 테이블(운영자 /admin/reports 큐). service key 로 직접 적재.
      const tt = ["party", "user", "message", "review"].includes(d.target_type) ? d.target_type : "party";
      const target_id =
        tt === "party" ? d.party_id
        : tt === "user" ? d.target_user_id
        : tt === "message" ? d.message_id
        : d.review_id;
      if (!target_id) return `${nick}: report 대상 없음(${tt})`;
      const reason_code = String(d.reason_code ?? "other").trim().slice(0, 40) || "other";
      const { error } = await admin.from("reports").insert({
        reporter_id: actor.userId,
        target_type: tt,
        target_id,
        // 거래 맥락 — 운영자 분쟁 화면 채팅 로그 점프용. 채팅 state 의 party_id.
        party_id: d.party_id ?? null,
        reason_code,
        reason_detail: d.reason_detail ? String(d.reason_detail).slice(0, 500) : null,
      });
      return `${nick} 🚨 신고[${tt}/${reason_code}] ${error ? "✗ " + error.message : "✓"}`;
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
