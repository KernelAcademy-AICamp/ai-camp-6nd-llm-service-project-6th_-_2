// 진단 스크립트: 채팅 RLS·publication·세션별 가시성 확인.
// 실행: node --env-file=apps/web/.env.local scripts/diag-chat.mjs

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

const PARTY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// 1) chat_room 확인
const { data: room } = await admin.from("chat_rooms").select("id, party_id").eq("party_id", PARTY).single();
console.log("[room]", room);

// 2) Realtime publication 등록 확인 (information_schema 우회용 — pg_publication_tables는 superuser 필요할 수도)
//    대신 raw SQL을 RPC로 호출 — Supabase는 기본적으로 sql 실행 RPC가 없으므로 시도만.
try {
  const { data, error } = await admin.rpc("pg_catalog_pub_tables");
  console.log("[publication via rpc]", data, error?.message);
} catch (e) {
  console.log("[publication via rpc] not available");
}

// 3) 각 사용자(rinrinyy818 / oloiol777) 토큰으로 로그인해 chat_messages를 SELECT
async function checkAsUser(email, password) {
  const c = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) {
    console.log(`[${email}] sign-in failed: ${error.message}`);
    return;
  }
  console.log(`[${email}] user_id = ${data.user.id}`);

  const { data: msgs, error: mErr } = await c
    .from("chat_messages")
    .select("id, sender_id, type, content")
    .eq("room_id", room.id)
    .order("created_at");
  if (mErr) {
    console.log(`[${email}] chat_messages SELECT error: ${mErr.message}`);
  } else {
    console.log(`[${email}] visible messages: ${msgs.length}`);
    for (const m of msgs) {
      console.log(`   ${m.type.padEnd(6)} ${(m.sender_id ?? "SYS").slice(0,8)} | ${m.content?.slice(0, 40)}`);
    }
  }
  await c.auth.signOut();
}

await checkAsUser("rinrinyy818@gmail.com", "123456");
console.log("---");
await checkAsUser("oloiol777@naver.com", "123456");
