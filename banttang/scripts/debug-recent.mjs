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

const { data: parties, error: pErr } = await admin
  .from("parties")
  .select("*")
  .limit(10);
if (pErr) console.log("ERR:", pErr);

console.log("Recent parties:");
for (const p of parties ?? []) {
  const { count: approved } = await admin
    .from("party_participants")
    .select("id", { count: "exact", head: true })
    .eq("party_id", p.id)
    .eq("status", "approved");
  const { data: room } = await admin
    .from("chat_rooms")
    .select("id")
    .eq("party_id", p.id)
    .maybeSingle();
  console.log(
    `  ${p.id.slice(0, 8)} status=${p.status} approved=${approved}/${p.max_participants} room=${room ? "Y" : "N"} :: ${p.title}`,
  );
}
