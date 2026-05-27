import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dir, "../.env.local"), "utf8");
const getEnv = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.replace(/\s*#.*$/, "").trim();

const admin = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false },
});

const { data: rooms } = await admin
  .from("chat_rooms")
  .select("id, party_id, opened_at");

const sorted = (rooms ?? []).sort((a, b) => (b.opened_at ?? "").localeCompare(a.opened_at ?? ""));
console.log("All chat rooms (newest first):");
for (const r of sorted) {
  const { count: midCount } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", r.id)
    .eq("type", "system");
  const { data: midMsg } = await admin
    .from("chat_messages")
    .select("metadata")
    .eq("room_id", r.id)
    .eq("type", "system")
    .order("created_at", { ascending: false });
  const hasMid = (midMsg ?? []).some((m) => m.metadata?.kind === "midpoint_recommendation");
  console.log(
    `  party=${r.party_id.slice(0, 8)} room=${r.id.slice(0, 8)} opened=${r.opened_at} system_msgs=${midCount} midpoint=${hasMid ? "Y" : "N"}`,
  );
}
