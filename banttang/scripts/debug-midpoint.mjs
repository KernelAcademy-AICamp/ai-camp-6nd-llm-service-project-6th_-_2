// 중간지점 추천 디버그 — 파티 상태 + chat_room + 시스템 메시지 + 멤버 home 좌표 확인
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dir, "../.env.local"), "utf8");
const getEnv = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.replace(/\s*#.*$/, "").trim();

const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const key = getEnv("SUPABASE_SECRET_KEY");
const admin = createClient(url, key, { auth: { persistSession: false } });

const partyId = process.argv[2] || "816d5759-6a6b-4260-b838-f2772e5d5dae";
console.log(`\n=== party ${partyId} ===`);

const { data: party } = await admin
  .from("parties")
  .select("id, status, max_participants, closed_at, category, title")
  .eq("id", partyId)
  .maybeSingle();
console.log("party:", party);

const { data: parts } = await admin
  .from("party_participants")
  .select("user_id, status, is_host, approved_at")
  .eq("party_id", partyId);
console.log(`participants (${parts?.length ?? 0}):`);
for (const p of parts ?? []) {
  const { data: u } = await admin.auth.admin.getUserById(p.user_id);
  const home = u?.user?.user_metadata?.home;
  console.log(
    `  - ${p.user_id.slice(0, 8)} status=${p.status} host=${p.is_host} email=${u?.user?.email} home=${home ? `(${home.lat}, ${home.lng})` : "MISSING"}`,
  );
}

const { data: room } = await admin
  .from("chat_rooms")
  .select("id, opened_at")
  .eq("party_id", partyId)
  .maybeSingle();
console.log("chat_room:", room || "NOT CREATED");

if (room) {
  const { data: msgs } = await admin
    .from("chat_messages")
    .select("id, type, system_event, content, metadata, created_at")
    .eq("room_id", room.id)
    .order("created_at");
  console.log(`messages (${msgs?.length ?? 0}):`);
  for (const m of msgs ?? []) {
    const kind = m.metadata?.kind;
    console.log(
      `  - [${m.type}] ${m.system_event ?? ""} kind=${kind ?? "-"} :: ${(m.content ?? "").slice(0, 60)}`,
    );
  }
}
