// Realtime 전달 진단: rinrinyy818로 subscribe → oloiol777로 INSERT → 이벤트 수신 여부 확인
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ROOM_ID = "2b85a2b9-2447-4fbc-8ace-139a74c6f8b6";

// 1) Subscriber: rinrinyy818
const sub = createClient(URL, PUB, { auth: { persistSession: false } });
const sin = await sub.auth.signInWithPassword({ email: "rinrinyy818@gmail.com", password: "123456" });
if (sin.error) { console.error("sub signIn:", sin.error.message); process.exit(1); }
console.log("[sub] signed in as", sin.data.user.id);

let received = 0;
const channel = sub
  .channel(`diag:${ROOM_ID}`)
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${ROOM_ID}` },
    (payload) => {
      received += 1;
      console.log("[sub] received INSERT:", payload.new.content);
    },
  )
  .subscribe((status, err) => {
    console.log("[sub] subscription status:", status, err?.message ?? "");
  });

// SUBSCRIBED 될 때까지 대기
await new Promise((r) => setTimeout(r, 3000));

// 2) Publisher: oloiol777 → INSERT
const pub = createClient(URL, PUB, { auth: { persistSession: false } });
const pin = await pub.auth.signInWithPassword({ email: "oloiol777@naver.com", password: "123456" });
if (pin.error) { console.error("pub signIn:", pin.error.message); process.exit(1); }
console.log("[pub] signed in as", pin.data.user.id);

const probe = `🔬 diag-${Date.now()}`;
const { error: insErr } = await pub.from("chat_messages").insert({
  room_id: ROOM_ID,
  sender_id: pin.data.user.id,
  type: "text",
  content: probe,
});
console.log("[pub] insert error:", insErr?.message ?? "none");

// 이벤트 수신 대기
await new Promise((r) => setTimeout(r, 4000));

console.log(`\n[result] received ${received} event(s) for probe="${probe}"`);
if (received === 0) {
  console.log("→ Realtime이 전달되지 않음. 가능한 원인:");
  console.log("   1) supabase_realtime publication에 chat_messages 미등록");
  console.log("   2) Supabase Realtime이 publishable 키로 RLS 접근 비활성화");
  console.log("   3) Realtime 인증 토큰 문제");
}

await sub.removeChannel(channel);
await sub.auth.signOut();
await pub.auth.signOut();
process.exit(0);
